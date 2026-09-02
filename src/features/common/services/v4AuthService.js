// Autenticação dos closers via Appwrite Account (e-mail/senha, self-hosted),
// com a sessão no Keychain do macOS (keytar). Independente do authService
// local do Glass: os repositórios continuam em modo 'local'/SQLite — este
// serviço só governa a identidade V4 usada pelo envio pós-call (v4SyncService).
//
// Particularidade do servidor (Appwrite 1.7.4): createEmailPasswordSession via
// SDK anônimo NÃO devolve session.secret no body — o secret vem no Set-Cookie.
// Por isso o login faz um fetch direto e captura o cookie; todo o resto usa o
// SDK com client.setSession(secret).
//
// O Appwrite é pull (sem onAuthStateChanged): sessão expirada/revogada aparece
// como 401 em qualquer request. O interceptor do appwriteClient chama
// _handleSessionInvalid(), que cai limpo para o estado deslogado.

const keytar = require('keytar');
const { APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID } = require('../config/appwriteConfig');
const { setSessionSecret, setOnAuthError, getAccountInstance } = require('./appwriteClient');

const KEYCHAIN_SERVICE = 'com.v4amaral.copiloto';
const KEYCHAIN_ACCOUNT = 'v4-session';

// Destino dos links de e-mail (recuperação e verificação).
//
// O Appwrite NÃO aceita deep link aqui: ele valida o host de `url` contra as
// plataformas registradas no projeto. Testado contra o servidor real —
// `pickleglass://recovery` devolve 400 "URL host must be one of: localhost,
// appwrite.v4companyamaral.com". E `http://localhost:<porta>` não serve na
// prática, porque o servidor local sobe em porta aleatória (`listen(0)` em
// index.js) e o e-mail pode ser aberto em outro dispositivo.
//
// Por isso o link aponta para uma página hospedada, que recebe ?userId=&secret=
// e conclui a troca (ou faz bounce para pickleglass://recovery, que o app já sabe
// receber). Sobrescrevíveis por env para apontar para o domínio do cliente.
const RECOVERY_URL = process.env.V4_RECOVERY_URL || 'https://conta.v4companyamaral.com/recuperar-senha';
const VERIFICATION_URL = process.env.V4_VERIFICATION_URL || 'https://conta.v4companyamaral.com/verificar-email';

// Erros do Appwrite vêm em inglês. Devolvemos os dois: `code` estável para a UI
// decidir o que destacar, e `error` já em pt-BR para exibir direto.
function traduzErro(json, status) {
    const type = json?.type || '';
    const msg = String(json?.message || '');

    if (type === 'user_already_exists') {
        return { code: 'email_ja_cadastrado', error: 'Este e-mail já tem uma conta. Faça login ou recupere a senha.' };
    }
    if (type === 'general_argument_invalid') {
        // O mesmo type cobre senha e e-mail — só a mensagem distingue.
        if (/`password`/.test(msg)) {
            return { code: 'senha_curta', error: 'A senha precisa ter no mínimo 8 caracteres e não pode ser uma senha comum.' };
        }
        if (/`email`/.test(msg)) {
            return { code: 'email_invalido', error: 'E-mail inválido. Confira o endereço digitado.' };
        }
        if (/`url`/.test(msg)) {
            return { code: 'url_nao_registrada', error: 'O link de e-mail não está liberado no servidor. Avise o suporte.' };
        }
        return { code: 'dados_invalidos', error: 'Dados inválidos. Confira o que foi preenchido.' };
    }
    if (type === 'user_not_found') {
        return { code: 'email_nao_encontrado', error: 'Não encontramos uma conta com este e-mail.' };
    }
    if (type === 'user_invalid_credentials' || type === 'user_password_mismatch') {
        return { code: 'credenciais_invalidas', error: 'E-mail ou senha incorretos.' };
    }
    if (type === 'user_invalid_token') {
        return { code: 'link_invalido', error: 'Este link de recuperação é inválido ou já foi usado. Peça um novo.' };
    }
    if (type === 'user_email_already_verified') {
        return { code: 'email_ja_verificado', error: 'Este e-mail já está verificado.' };
    }
    if (type === 'general_rate_limit_exceeded' || status === 429) {
        return { code: 'muitas_tentativas', error: 'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.' };
    }
    if (status === 401) {
        return { code: 'sem_sessao', error: 'Sua sessão expirou. Entre novamente.' };
    }
    return { code: type || 'erro_desconhecido', error: 'Não foi possível concluir. Tente novamente em instantes.' };
}

class V4AuthService {
    constructor() {
        this.session = null; // { secret, uid, email }
        this.loadPromise = null;
        this._handlingAuthError = false;
        setOnAuthError(() => this._handleSessionInvalid());
    }

    async _persist() {
        try {
            if (this.session) {
                await keytar.setPassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT, JSON.stringify(this.session));
            } else {
                await keytar.deletePassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT);
            }
        } catch (err) {
            console.warn('[V4Auth] Keychain unavailable, session will not persist:', err.message);
        }
    }

    /**
     * Restaura a sessão do Keychain uma única vez. Valida contra o servidor
     * com account.get(); 401 descarta o secret, erro de rede mantém a sessão
     * (offline-first — o interceptor derruba depois se ela estiver revogada).
     */
    async _loadFromKeychain() {
        if (this.session) return;
        if (!this.loadPromise) {
            this.loadPromise = (async () => {
                let stored = null;
                try {
                    const raw = await keytar.getPassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT);
                    if (raw) stored = JSON.parse(raw);
                } catch (err) {
                    console.warn('[V4Auth] Could not read session from Keychain:', err.message);
                    return;
                }
                if (!stored) return;
                if (!stored.secret) {
                    // Formato antigo (JWT do Supabase) — migração: descartar e pedir novo login.
                    console.log('[V4Auth] Discarding legacy Supabase session from Keychain.');
                    try { await keytar.deletePassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT); } catch (_) {}
                    return;
                }
                setSessionSecret(stored.secret);
                try {
                    const me = await getAccountInstance().get();
                    this.session = { secret: stored.secret, uid: me.$id, email: me.email, emailVerified: !!me.emailVerification };
                    console.log(`[V4Auth] Session restored for ${me.email}`);
                } catch (err) {
                    if (err?.code === 401) {
                        console.warn('[V4Auth] Stored session invalid — clearing.');
                        setSessionSecret(null);
                        try { await keytar.deletePassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT); } catch (_) {}
                    } else {
                        // Sem rede: mantém a sessão do cache; o interceptor resolve depois.
                        this.session = stored;
                        console.warn('[V4Auth] Could not validate session (offline?); keeping cached state:', err.message);
                    }
                }
            })();
        }
        await this.loadPromise;
    }

    async login(email, password) {
        try {
            const resp = await fetch(`${APPWRITE_ENDPOINT}/account/sessions/email`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Appwrite-Project': APPWRITE_PROJECT_ID,
                    'X-Appwrite-Locale': 'pt-br',
                    'X-Appwrite-Response-Format': '1.7.0',
                },
                body: JSON.stringify({ email: (email || '').trim(), password }),
            });
            const json = await resp.json().catch(() => ({}));
            if (!resp.ok) {
                throw new Error(json.message || `HTTP ${resp.status}`);
            }
            const setCookies = resp.headers.getSetCookie ? resp.headers.getSetCookie() : [resp.headers.get('set-cookie')];
            const cookie = (setCookies || []).find(
                c => c && c.startsWith(`a_session_${APPWRITE_PROJECT_ID.toLowerCase()}=`) && !c.includes('_legacy=')
            );
            const secret = cookie ? decodeURIComponent(cookie.split(';')[0].split('=')[1]) : null;
            if (!secret) {
                throw new Error('Login ok, mas o servidor não devolveu o cookie de sessão.');
            }

            setSessionSecret(secret);
            const me = await getAccountInstance().get(); // valida antes de persistir
            this.session = { secret, uid: me.$id, email: me.email, emailVerified: !!me.emailVerification };
            this.loadPromise = Promise.resolve();
            await this._persist();
            console.log(`[V4Auth] Logged in as ${this.session.email}`);
            return { success: true, email: this.session.email };
        } catch (err) {
            console.error('[V4Auth] Login failed:', err.message);
            return { success: false, error: err.message };
        }
    }

    /**
     * Chamada a um endpoint público do Account (sem sessão): cadastro e
     * recuperação. Mesmo padrão do login — fetch direto, para não depender do
     * SDK anônimo. Nunca loga corpo da requisição (contém senha).
     */
    async _publicCall(caminho, metodo, body) {
        const resp = await fetch(`${APPWRITE_ENDPOINT}${caminho}`, {
            method: metodo,
            headers: {
                'Content-Type': 'application/json',
                'X-Appwrite-Project': APPWRITE_PROJECT_ID,
                'X-Appwrite-Locale': 'pt-br',
                'X-Appwrite-Response-Format': '1.7.0',
            },
            body: JSON.stringify(body),
        });
        const json = await resp.json().catch(() => ({}));
        return { ok: resp.ok, status: resp.status, json };
    }

    /**
     * Cria a conta e JÁ deixa o usuário logado — o cliente não precisa entrar de
     * novo depois de se cadastrar.
     */
    async createAccount(email, name, password) {
        const emailLimpo = (email || '').trim();
        try {
            const { ok, status, json } = await this._publicCall('/account', 'POST', {
                userId: 'unique()',
                email: emailLimpo,
                password,
                name: (name || '').trim(),
            });
            if (!ok) {
                const { code, error } = traduzErro(json, status);
                console.warn(`[V4Auth] Cadastro recusado (${code})`);
                return { success: false, code, error };
            }
            console.log(`[V4Auth] Conta criada para ${emailLimpo} — autenticando`);

            // Login imediato: reaproveita todo o fluxo de cookie/Keychain já existente.
            const entrou = await this.login(emailLimpo, password);
            if (!entrou.success) {
                // Conta existe, mas a sessão falhou: o usuário consegue entrar na tela de login.
                return {
                    success: true,
                    autenticado: false,
                    email: emailLimpo,
                    error: 'Conta criada, mas não foi possível entrar automaticamente. Faça login.',
                };
            }
            this._broadcastStateChange();
            return { success: true, autenticado: true, email: emailLimpo };
        } catch (err) {
            console.error('[V4Auth] Falha ao criar conta:', err.message);
            return { success: false, code: 'falha_rede', error: 'Sem conexão com o servidor. Tente novamente.' };
        }
    }

    /**
     * Dispara o e-mail de confirmação para o usuário logado.
     *
     * Vai por fetch direto, e não pelo SDK, pelo mesmo motivo do login: o
     * node-appwrite 28 é feito para o Appwrite 1.9.x e chama
     * POST /account/verifications (plural), que no 1.7.4 do servidor devolve 404
     * general_route_not_found. A rota desta versão é /account/verification.
     */
    async sendVerification() {
        await this._loadFromKeychain();
        if (!this.session) {
            return { success: false, code: 'sem_sessao', error: 'Entre na sua conta para confirmar o e-mail.' };
        }
        try {
            const resp = await fetch(`${APPWRITE_ENDPOINT}/account/verification`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Appwrite-Project': APPWRITE_PROJECT_ID,
                    'X-Appwrite-Locale': 'pt-br',
                    'X-Appwrite-Response-Format': '1.7.0',
                    'X-Appwrite-Session': this.session.secret,
                },
                body: JSON.stringify({ url: VERIFICATION_URL }),
            });
            const json = await resp.json().catch(() => ({}));
            if (!resp.ok) {
                const { code, error } = traduzErro(json, resp.status);
                console.warn(`[V4Auth] Falha ao enviar verificação (${code})`);
                return { success: false, code, error };
            }
            console.log('[V4Auth] E-mail de verificação enviado.');
            return { success: true };
        } catch (err) {
            console.error('[V4Auth] Falha ao enviar verificação:', err.message);
            return { success: false, code: 'falha_rede', error: 'Sem conexão com o servidor. Tente novamente.' };
        }
    }

    /** Dispara o e-mail de recuperação de senha (não exige sessão). */
    async sendRecovery(email) {
        try {
            const { ok, status, json } = await this._publicCall('/account/recovery', 'POST', {
                email: (email || '').trim(),
                url: RECOVERY_URL,
            });
            if (!ok) {
                const { code, error } = traduzErro(json, status);
                console.warn(`[V4Auth] Recuperação recusada (${code})`);
                return { success: false, code, error };
            }
            console.log('[V4Auth] E-mail de recuperação enviado.');
            return { success: true };
        } catch (err) {
            console.error('[V4Auth] Falha ao pedir recuperação:', err.message);
            return { success: false, code: 'falha_rede', error: 'Sem conexão com o servidor. Tente novamente.' };
        }
    }

    /**
     * Conclui a troca de senha com o par userId+secret que veio no link do e-mail.
     * O secret nunca é logado.
     */
    async completeRecovery(userId, secret, newPassword) {
        try {
            const { ok, status, json } = await this._publicCall('/account/recovery', 'PUT', {
                userId,
                secret,
                password: newPassword,
            });
            if (!ok) {
                const { code, error } = traduzErro(json, status);
                console.warn(`[V4Auth] Troca de senha recusada (${code})`);
                return { success: false, code, error };
            }
            console.log('[V4Auth] Senha alterada com sucesso.');
            return { success: true };
        } catch (err) {
            console.error('[V4Auth] Falha ao concluir recuperação:', err.message);
            return { success: false, code: 'falha_rede', error: 'Sem conexão com o servidor. Tente novamente.' };
        }
    }

    async logout() {
        try {
            await getAccountInstance().deleteSession({ sessionId: 'current' });
        } catch (err) {
            // Sessão já inválida no servidor: seguir com o logout local mesmo assim.
            console.warn('[V4Auth] deleteSession failed (continuing local logout):', err.message);
        }
        this.session = null;
        this.loadPromise = null;
        setSessionSecret(null);
        await this._persist();
        return { success: true };
    }

    /** Interceptor de 401: sessão expirou ou foi revogada no servidor. */
    async _handleSessionInvalid() {
        if (this._handlingAuthError || !this.session) return;
        this._handlingAuthError = true;
        try {
            console.warn('[V4Auth] 401 detected — session expired or revoked. Logging out locally.');
            this.session = null;
            this.loadPromise = null;
            setSessionSecret(null);
            await this._persist();
            this._broadcastStateChange();
        } catch (err) {
            console.error('[V4Auth] Error during session-expiry cleanup:', err);
        } finally {
            this._handlingAuthError = false;
        }
    }

    /** Avisa as janelas para recarregarem o estado (SettingsView escuta user-state-changed). */
    _broadcastStateChange() {
        try {
            const { BrowserWindow } = require('electron');
            BrowserWindow.getAllWindows().forEach(win => {
                if (win && !win.isDestroyed() && win.webContents && !win.webContents.isDestroyed()) {
                    win.webContents.send('user-state-changed', { v4SessionExpired: true });
                }
            });
        } catch (_) {
            // fora do Electron (harness/testes): sem janelas para avisar
        }
    }

    /** uid do closer logado no Appwrite, ou null (chamador decide como falhar). */
    async getUserId() {
        await this._loadFromKeychain();
        return this.session?.uid || null;
    }

    async getState() {
        await this._loadFromKeychain();
        return {
            loggedIn: !!this.session,
            email: this.session?.email || null,
            // A UI usa isto para oferecer o "confirmar e-mail". Fica false enquanto
            // não houver sessão, e é atualizado no login e na restauração do Keychain.
            emailVerified: !!this.session?.emailVerified,
        };
    }
}

const v4AuthService = new V4AuthService();
module.exports = v4AuthService;
