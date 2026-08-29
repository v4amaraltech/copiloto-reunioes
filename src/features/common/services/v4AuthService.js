// Autenticação dos closers via Supabase Auth (Enriquece AI), com tokens no
// Keychain do macOS (keytar). Independente do authService local do Glass:
// os repositórios continuam em modo 'local'/SQLite — este serviço só governa
// a identidade V4 usada pelo proxy-llm (e, no Sprint 2, briefing/transcrição).

const keytar = require('keytar');
const { V4_SUPABASE_URL, V4_SUPABASE_ANON_KEY, V4_PROXY_KEY_PLACEHOLDER } = require('../config/v4Config');

const KEYCHAIN_SERVICE = 'com.v4amaral.copiloto';
const KEYCHAIN_ACCOUNT = 'v4-session';
const REFRESH_MARGIN_MS = 60 * 1000; // renova se faltar menos de 60s

class V4AuthService {
    constructor() {
        this.session = null; // { access_token, refresh_token, expires_at (ms), email }
        this.loadPromise = null;
    }

    async _authRequest(grantType, payload) {
        const resp = await fetch(`${V4_SUPABASE_URL}/auth/v1/token?grant_type=${grantType}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                apikey: V4_SUPABASE_ANON_KEY,
            },
            body: JSON.stringify(payload),
        });
        const json = await resp.json().catch(() => ({}));
        if (!resp.ok) {
            const message = json.error_description || json.msg || json.error || `HTTP ${resp.status}`;
            throw new Error(message);
        }
        return json;
    }

    _sessionFromResponse(json) {
        return {
            access_token: json.access_token,
            refresh_token: json.refresh_token,
            expires_at: Date.now() + (json.expires_in || 3600) * 1000,
            email: json.user?.email || this.session?.email || '',
        };
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

    async _loadFromKeychain() {
        if (this.session) return;
        if (!this.loadPromise) {
            this.loadPromise = (async () => {
                try {
                    const raw = await keytar.getPassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT);
                    if (raw) this.session = JSON.parse(raw);
                } catch (err) {
                    console.warn('[V4Auth] Could not read session from Keychain:', err.message);
                }
            })();
        }
        await this.loadPromise;
    }

    async login(email, password) {
        try {
            const json = await this._authRequest('password', { email: (email || '').trim(), password });
            this.session = this._sessionFromResponse(json);
            await this._persist();
            await this._activateProxyLlm();
            console.log(`[V4Auth] Logged in as ${this.session.email}`);
            return { success: true, email: this.session.email };
        } catch (err) {
            console.error('[V4Auth] Login failed:', err.message);
            return { success: false, error: err.message };
        }
    }

    async logout() {
        this.session = null;
        this.loadPromise = null;
        await this._persist();
        return { success: true };
    }

    /**
     * JWT válido do closer, renovando via refresh_token quando perto de expirar.
     * Retorna null quando não há sessão (chamador decide como falhar).
     */
    async getAccessToken() {
        await this._loadFromKeychain();
        if (!this.session) return null;

        if (Date.now() > this.session.expires_at - REFRESH_MARGIN_MS) {
            try {
                const json = await this._authRequest('refresh_token', { refresh_token: this.session.refresh_token });
                this.session = this._sessionFromResponse(json);
                await this._persist();
                console.log('[V4Auth] Session refreshed');
            } catch (err) {
                console.error('[V4Auth] Session refresh failed:', err.message);
                this.session = null;
                await this._persist();
                return null;
            }
        }
        return this.session.access_token;
    }

    async getState() {
        await this._loadFromKeychain();
        return {
            loggedIn: !!this.session,
            email: this.session?.email || null,
        };
    }

    /**
     * Após o login, registra o provider Anthropic com o placeholder de proxy
     * para a auto-seleção de modelos apontar o LLM para o claude via proxy-llm.
     */
    async _activateProxyLlm() {
        try {
            if (global.modelStateService) {
                await global.modelStateService.setApiKey('anthropic', V4_PROXY_KEY_PLACEHOLDER);
            }
        } catch (err) {
            console.warn('[V4Auth] Could not auto-activate Anthropic via proxy:', err.message);
        }
    }
}

const v4AuthService = new V4AuthService();
module.exports = v4AuthService;
