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
                    this.session = { secret: stored.secret, uid: me.$id, email: me.email };
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
            this.session = { secret, uid: me.$id, email: me.email };
            this.loadPromise = Promise.resolve();
            await this._persist();
            console.log(`[V4Auth] Logged in as ${this.session.email}`);
            return { success: true, email: this.session.email };
        } catch (err) {
            console.error('[V4Auth] Login failed:', err.message);
            return { success: false, error: err.message };
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
        };
    }
}

const v4AuthService = new V4AuthService();
module.exports = v4AuthService;
