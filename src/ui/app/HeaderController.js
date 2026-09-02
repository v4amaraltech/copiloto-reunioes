import './MainHeader.js';
import './ApiKeyHeader.js';
import './PermissionHeader.js';
import './WelcomeHeader.js';
import './SignupHeader.js';
import './VerifyEmailHeader.js';
import './LoginHeader.js';

/**
 * Estado reportado ao main process por tela. Só 'main' cria as janelas filhas;
 * qualquer outro valor as destrói. As telas de conta fazem parte da configuração
 * inicial — não há sessão de escuta em andamento —, então reportam 'apikey',
 * como welcome e permission já faziam. Uma tela que possa abrir com o app já em
 * uso precisa reportar 'main' aqui, senão derruba as janelas filhas.
 */
/** Telas da jornada de conta: uma atualização de estado não deve interrompê-las. */
const ACCOUNT_JOURNEY_TYPES = new Set(['welcome', 'signup', 'verify', 'login']);

const HEADER_STATE_BY_TYPE = {
    welcome: 'apikey',
    signup: 'apikey',
    verify: 'apikey',
    login: 'apikey',
    apikey: 'apikey',
    permission: 'apikey',
    main: 'main',
};

class HeaderTransitionManager {
    constructor() {
        this.headerContainer      = document.getElementById('header-container');
        this.currentHeaderType    = null;   // 'welcome' | 'signup' | 'verify' | 'login' | 'apikey' | 'main' | 'permission'
        this.welcomeHeader        = null;
        this.apiKeyHeader         = null;
        this.mainHeader            = null;
        this.permissionHeader      = null;
        this.signupHeader          = null;
        this.verifyEmailHeader     = null;
        this.loginHeader           = null;
        this.pendingEmail          = '';

        /**
         * only one header window is allowed
         * @param {'welcome'|'signup'|'verify'|'login'|'apikey'|'main'|'permission'} type
         */
        this.ensureHeader = (type) => {
            console.log('[HeaderController] ensureHeader: Ensuring header of type:', type);
            if (this.currentHeaderType === type) {
                console.log('[HeaderController] ensureHeader: Header of type:', type, 'already exists.');
                return;
            }

            this.headerContainer.innerHTML = '';
            
            this.welcomeHeader = null;
            this.apiKeyHeader = null;
            this.mainHeader = null;
            this.permissionHeader = null;
            this.signupHeader = null;
            this.verifyEmailHeader = null;
            this.loginHeader = null;

            // Create new header element
            if (type === 'welcome') {
                this.welcomeHeader = document.createElement('welcome-header');
                this.welcomeHeader.apiKeyCallback = () => this.handleApiKeyOption();
                this.welcomeHeader.signupCallback = () => this.transitionToSignupHeader();
                this.welcomeHeader.loginCallback = () => this.transitionToLoginHeader();
                this.headerContainer.appendChild(this.welcomeHeader);
                console.log('[HeaderController] ensureHeader: Header of type:', type, 'created.');
            } else if (type === 'signup') {
                this.signupHeader = document.createElement('signup-header');
                this.signupHeader.addEventListener('request-resize', e => this._resizeForAccount(e.detail.height));
                this.signupHeader.createdCallback = (email) => this.transitionToVerifyEmailHeader(email);
                this.signupHeader.loginCallback = () => this.transitionToLoginHeader();
                this.signupHeader.backCallback = () => this.transitionToWelcomeHeader();
                this.headerContainer.appendChild(this.signupHeader);
            } else if (type === 'verify') {
                this.verifyEmailHeader = document.createElement('verify-email-header');
                this.verifyEmailHeader.addEventListener('request-resize', e => this._resizeForAccount(e.detail.height));
                this.verifyEmailHeader.email = this.pendingEmail;
                // Confirmar o e-mail não trava o fluxo: daqui segue a configuração.
                this.verifyEmailHeader.continueCallback = () => this.continueAfterAccount();
                this.headerContainer.appendChild(this.verifyEmailHeader);
            } else if (type === 'login') {
                this.loginHeader = document.createElement('login-header');
                this.loginHeader.addEventListener('request-resize', e => this._resizeForAccount(e.detail.height));
                this.loginHeader.loggedInCallback = () => this.continueAfterAccount();
                this.loginHeader.signupCallback = () => this.transitionToSignupHeader();
                this.loginHeader.recoveryCallback = (email) => this.handleRecoveryOption(email);
                this.loginHeader.backCallback = () => this.transitionToWelcomeHeader();
                this.headerContainer.appendChild(this.loginHeader);
            } else if (type === 'apikey') {
                this.apiKeyHeader = document.createElement('apikey-header');
                this.apiKeyHeader.stateUpdateCallback = (userState) => this.handleStateUpdate(userState);
                this.apiKeyHeader.backCallback = () => this.transitionToWelcomeHeader();
                this.apiKeyHeader.addEventListener('request-resize', e => {
                    this._resizeForApiKey(e.detail.height); 
                });
                this.headerContainer.appendChild(this.apiKeyHeader);
                console.log('[HeaderController] ensureHeader: Header of type:', type, 'created.');
            } else if (type === 'permission') {
                this.permissionHeader = document.createElement('permission-setup');
                this.permissionHeader.addEventListener('request-resize', e => {
                    this._resizeForPermissionHeader(e.detail.height); 
                });
                this.permissionHeader.continueCallback = async () => {
                    if (window.api && window.api.headerController) {
                        console.log('[HeaderController] Re-initializing model state after permission grant...');
                        await window.api.headerController.reInitializeModelState();
                    }
                    this.transitionToMainHeader();
                };
                this.headerContainer.appendChild(this.permissionHeader);
            } else {
                this.mainHeader = document.createElement('main-header');
                this.headerContainer.appendChild(this.mainHeader);
                this.mainHeader.startSlideInAnimation?.();
            }

            this.currentHeaderType = type;
            this.notifyHeaderState(HEADER_STATE_BY_TYPE[type] || 'apikey');
        };

        console.log('[HeaderController] Manager initialized');

        // WelcomeHeader 콜백 메서드들
        this.handleApiKeyOption = this.handleApiKeyOption.bind(this);

        this._bootstrap();

        if (window.api) {
            window.api.headerController.onUserStateChanged((event, userState) => {
                console.log('[HeaderController] Received user state change:', userState);
                this.handleStateUpdate(userState);
            });

            window.api.headerController.onAuthFailed((event, { message }) => {
                console.error('[HeaderController] Received auth failure from main process:', message);
                if (this.apiKeyHeader) {
                    this.apiKeyHeader.errorMessage = 'Authentication failed. Please try again.';
                    this.apiKeyHeader.isLoading = false;
                }
            });
            // Configurações → Conta → "Criar conta" / "Entrar": a janela de
            // configurações fecha sozinha (o estado deixa de ser 'main') e a
            // flutuante mostra a tela pedida.
            window.api.headerController.onForceShowAccountHeader?.(async (event, { screen, reason } = {}) => {
                console.log('[HeaderController] Pedido para mostrar tela de conta:', screen, reason || '');
                // Voltando da página de nova senha: quem já está com sessão ativa
                // não precisa entrar de novo — só trazemos o app para a frente.
                if (reason === 'recovery-done' && (await this._hasAccountSession())) return;
                if (screen === 'login') return this.transitionToLoginHeader();
                if (screen === 'welcome') return this.transitionToWelcomeHeader();
                return this.transitionToSignupHeader();
            });
            window.api.headerController.onForceShowApiKeyHeader(async () => {
                console.log('[HeaderController] Received broadcast to show apikey header. Switching now.');
                const isConfigured = await window.api.apiKeyHeader.areProvidersConfigured();
                if (!isConfigured) {
                    await this._resizeForWelcome();
                    this.ensureHeader('welcome');
                } else {
                    await this._resizeForApiKey();
                    this.ensureHeader('apikey');
                }
            });            
        }
    }

    notifyHeaderState(stateOverride) {
        const state = stateOverride || this.currentHeaderType || 'apikey';
        if (window.api) {
            window.api.headerController.sendHeaderStateChanged(state);
        }
    }

    async _bootstrap() {
        // The initial state will be sent by the main process via 'user-state-changed'
        // We just need to request it.
        if (window.api) {
            const userState = await window.api.common.getCurrentUser();
            console.log('[HeaderController] Bootstrapping with initial user state:', userState);
            this.handleStateUpdate(userState);
        } else {
            // Fallback for non-electron environment (testing/web)
            this.ensureHeader('welcome');
        }
    }


    //////// after_modelStateService ////////
    async handleStateUpdate(userState) {
        // A conta vem antes de tudo: sem sessão, a jornada (criar conta / entrar)
        // aparece mesmo que as chaves de IA já estejam configuradas — senão quem
        // já usava o app nunca chega ao cadastro. Se a pessoa já está numa tela
        // da jornada, uma atualização de estado não a arranca de lá.
        if (!(await this._hasAccountSession())) {
            if (ACCOUNT_JOURNEY_TYPES.has(this.currentHeaderType)) return;
            await this._resizeForWelcome();
            return this.ensureHeader('welcome');
        }

        const isConfigured = await window.api.apiKeyHeader.areProvidersConfigured();
        if (!isConfigured) {
            // Conta pronta, falta a chave de IA.
            return this.handleApiKeyOption();
        }

        // If providers are configured, always check permissions regardless of login state.
        const permissionResult = await this.checkPermissions();
        if (permissionResult.success) {
            this.transitionToMainHeader();
        } else {
            this.transitionToPermissionHeader();
        }
    }

    /** Sessão de conta ativa? Sem o serviço disponível, assume que não. */
    async _hasAccountSession() {
        try {
            const state = await window.api?.v4Auth?.getState?.();
            return !!(state && (state.isLoggedIn || state.loggedIn || state.user));
        } catch (error) {
            console.warn('[HeaderController] Não foi possível ler o estado da conta:', error);
            return false;
        }
    }

    // WelcomeHeader 콜백 메서드들
    async handleApiKeyOption() {
        console.log('[HeaderController] API key option selected');
        await this._resizeForApiKey(434);
        this.ensureHeader('apikey');
        // ApiKeyHeader에 뒤로가기 콜백 설정
        if (this.apiKeyHeader) {
            this.apiKeyHeader.backCallback = () => this.transitionToWelcomeHeader();
        }
    }

    async transitionToWelcomeHeader() {
        if (this.currentHeaderType === 'welcome') {
            return this._resizeForWelcome();
        }

        await this._resizeForWelcome();
        this.ensureHeader('welcome');
    }
    //////// after_modelStateService ////////

    // ── Jornada de conta: criar conta → confirmar e-mail → configuração ──

    async transitionToSignupHeader() {
        if (this.currentHeaderType === 'signup') return;
        await this._resizeForAccount(400);
        this.ensureHeader('signup');
    }

    async transitionToVerifyEmailHeader(email) {
        this.pendingEmail = email || this.pendingEmail;
        if (this.currentHeaderType === 'verify') {
            if (this.verifyEmailHeader) this.verifyEmailHeader.email = this.pendingEmail;
            return;
        }
        await this._resizeForAccount(300);
        this.ensureHeader('verify');
    }

    async transitionToLoginHeader() {
        if (this.currentHeaderType === 'login') return;
        await this._resizeForAccount(360);
        this.ensureHeader('login');
    }

    /**
     * Depois de criar a conta ou entrar, o cliente cai no resto da configuração:
     * se ainda falta chave de IA vai para lá; senão, permissões ou direto ao uso.
     */
    async continueAfterAccount() {
        if (!window.api) return this.transitionToMainHeader();

        const isConfigured = await window.api.apiKeyHeader.areProvidersConfigured();
        if (!isConfigured) {
            return this.handleApiKeyOption();
        }

        const permissionResult = await this.checkPermissions();
        if (permissionResult.success) {
            return this.transitionToMainHeader();
        }
        return this.transitionToPermissionHeader();
    }

    /**
     * "Esqueci minha senha": pede ao Appwrite o e-mail com o link para
     * conta.v4companyamaral.com/recuperar-senha. A troca acontece na página web;
     * a pessoa volta aqui só para entrar com a senha nova.
     */
    async handleRecoveryOption(email) {
        const header = this.loginHeader;
        if (!header) return;
        header.formError = '';
        header.noticeMessage = '';

        const address = (email || '').trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
            header.formError = 'Digite seu e-mail acima para receber o link de recuperação.';
            return;
        }
        if (!window.api?.v4Auth?.sendRecovery) {
            header.formError = 'Recuperação indisponível nesta versão. Atualize o aplicativo.';
            return;
        }

        header.isLoading = true;
        try {
            const result = await window.api.v4Auth.sendRecovery(address);
            if (result?.success) {
                header.noticeMessage = `Enviamos um link para ${address}. Crie a nova senha por lá e volte aqui para entrar.`;
            } else {
                header.formError = result?.error || 'Não foi possível enviar o e-mail. Tente de novo.';
            }
        } catch (error) {
            console.error('[HeaderController] Falha ao pedir recuperação:', error);
            header.formError = 'Não foi possível enviar o e-mail. Tente de novo.';
        } finally {
            header.isLoading = false;
        }
    }

    async transitionToPermissionHeader() {
        // Prevent duplicate transitions
        if (this.currentHeaderType === 'permission') {
            console.log('[HeaderController] Already showing permission setup, skipping transition');
            return;
        }

        // Check if permissions were previously completed
        if (window.api) {
            try {
                const permissionsCompleted = await window.api.headerController.checkPermissionsCompleted();
                if (permissionsCompleted) {
                    console.log('[HeaderController] Permissions were previously completed, checking current status...');
                    
                    // Double check current permission status
                    const permissionResult = await this.checkPermissions();
                    if (permissionResult.success) {
                        // Skip permission setup if already granted
                        this.transitionToMainHeader();
                        return;
                    }
                    
                    console.log('[HeaderController] Permissions were revoked, showing setup again');
                }
            } catch (error) {
                console.error('[HeaderController] Error checking permissions completed status:', error);
            }
        }

        const initialHeight = 256;

        await this._resizeForPermissionHeader(initialHeight);
        this.ensureHeader('permission');
    }

    async transitionToMainHeader(animate = true) {
        if (this.currentHeaderType === 'main') {
            return this._resizeForMain();
        }

        await this._resizeForMain();
        this.ensureHeader('main');
    }

    async _resizeForMain() {
        if (!window.api) return;
        console.log('[HeaderController] _resizeForMain: Resizing window to 660x47');
        return window.api.headerController.resizeHeaderWindow({ width: 660, height: 47 }).catch(() => {});
    }

    async _resizeForApiKey(height = 404) {
        if (!window.api) return;
        console.log(`[HeaderController] _resizeForApiKey: Resizing window to 520x${height}`);
        return window.api.headerController.resizeHeaderWindow({ width: 520, height: height }).catch(() => {});
    }

    /** Telas de conta: mesma largura da janela do onboarding, altura pelo conteúdo. */
    async _resizeForAccount(height = 360) {
        if (!window.api) return;
        const finalHeight = Math.max(220, Math.round(height));
        return window.api.headerController.resizeHeaderWindow({ width: 520, height: finalHeight }).catch(() => {});
    }

    async _resizeForPermissionHeader(height) {
        if (!window.api) return;
        const finalHeight = height || 256;
        return window.api.headerController.resizeHeaderWindow({ width: 285, height: finalHeight })
            .catch(() => {});
    }

    async _resizeForWelcome() {
        if (!window.api) return;
        console.log('[HeaderController] _resizeForWelcome: Resizing window to 520x270');
        return window.api.headerController.resizeHeaderWindow({ width: 520, height: 270 })
            .catch(() => {});
    }

    async checkPermissions() {
        if (!window.api) {
            return { success: true };
        }
        
        try {
            const permissions = await window.api.headerController.checkSystemPermissions();
            console.log('[HeaderController] Current permissions:', permissions);
            
            if (!permissions.needsSetup) {
                return { success: true };
            }

            let errorMessage = '';
            if (!permissions.microphone && !permissions.screen) {
                errorMessage = 'Microphone and screen recording access required';
            }
            
            return { 
                success: false, 
                error: errorMessage
            };
        } catch (error) {
            console.error('[HeaderController] Error checking permissions:', error);
            return { 
                success: false, 
                error: 'Failed to check permissions' 
            };
        }
    }
}

window.addEventListener('DOMContentLoaded', () => {
    new HeaderTransitionManager();
});
