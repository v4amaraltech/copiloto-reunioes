import { LitElement, html, css } from '../assets/lit-core-2.7.4.min.js';

export class PermissionHeader extends LitElement {
    static styles = css`
        :host {
            display: block;
            transition: opacity 0.3s ease-in, transform 0.3s ease-in;
            will-change: opacity, transform;
        }

        :host(.sliding-out) {
            opacity: 0;
            transform: translateY(-20px);
        }

        :host(.hidden) {
            opacity: 0;
            pointer-events: none;
        }

        * {
            font-family: 'Helvetica Neue', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            cursor: default;
            user-select: none;
            box-sizing: border-box;
        }

        .container {
            -webkit-app-region: drag;
            width: 285px;
            /* height is now set dynamically */
            padding: 18px 20px;
            background: rgba(0, 0, 0, 0.3);
            border-radius: 16px;
            overflow: hidden;
            position: relative;
            display: flex;
            flex-direction: column;
            align-items: center;
        }

        .container::after {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            border-radius: 16px;
            padding: 1px;
            background: linear-gradient(169deg, rgba(255, 255, 255, 0.5) 0%, rgba(255, 255, 255, 0) 50%, rgba(255, 255, 255, 0.5) 100%);
            -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
            -webkit-mask-composite: destination-out;
            mask-composite: exclude;
            pointer-events: none;
        }

        .close-button {
            -webkit-app-region: no-drag;
            position: absolute;
            top: 10px;
            right: 10px;
            width: 14px;
            height: 14px;
            background: rgba(255, 255, 255, 0.1);
            border: none;
            border-radius: 3px;
            color: rgba(255, 255, 255, 0.7);
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.15s ease;
            z-index: 10;
            font-size: 14px;
            line-height: 1;
            padding: 0;
        }

        .close-button:hover {
            background: rgba(255, 255, 255, 0.2);
            color: rgba(255, 255, 255, 0.9);
        }

        .close-button:active {
            transform: scale(0.95);
        }

        .title {
            color: white;
            font-size: 16px;
            font-weight: 500;
            margin: 0;
            text-align: center;
            flex-shrink: 0;
        }

        .form-content {
            display: flex;
            flex-direction: column;
            align-items: center;
            width: 100%;
            margin-top: auto;
        }

        .form-content.all-granted {
            flex-grow: 1;
            justify-content: center;
            margin-top: 0;
        }

        .subtitle {
            color: rgba(255, 255, 255, 0.7);
            font-size: 11px;
            font-weight: 400;
            text-align: center;
            margin-bottom: 12px;
            line-height: 1.3;
        }

        /* O porquê vem antes do pedido: quem entende para que serve, libera. */
        .why {
            color: rgba(255, 255, 255, 0.62);
            font-size: 11px;
            font-weight: 400;
            text-align: center;
            line-height: 1.4;
            margin-bottom: 10px;
        }

        .permission-status {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            margin-bottom: 12px;
            min-height: 20px;
        }

        .permission-item {
            display: flex;
            align-items: center;
            gap: 6px;
            color: rgba(255, 255, 255, 0.8);
            font-size: 11px;
            font-weight: 400;
        }

        .permission-item.granted {
            color: rgba(34, 197, 94, 0.9);
        }

        .permission-icon {
            width: 12px;
            height: 12px;
            opacity: 0.8;
        }

        .check-icon {
            width: 12px;
            height: 12px;
            color: rgba(34, 197, 94, 0.9);
        }

        .action-button {
            -webkit-app-region: no-drag;
            width: 100%;
            height: 34px;
            background: rgba(255, 255, 255, 0.2);
            border: none;
            border-radius: 10px;
            color: white;
            font-size: 12px;
            font-weight: 500;
            cursor: pointer;
            transition: background 0.15s ease;
            position: relative;
            overflow: hidden;
            margin-bottom: 6px;
        }

        .action-button::after {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            border-radius: 10px;
            padding: 1px;
            background: linear-gradient(169deg, rgba(255, 255, 255, 0.5) 0%, rgba(255, 255, 255, 0) 50%, rgba(255, 255, 255, 0.5) 100%);
            -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
            -webkit-mask-composite: destination-out;
            mask-composite: exclude;
            pointer-events: none;
        }

        .action-button:hover:not(:disabled) {
            background: rgba(255, 255, 255, 0.3);
        }

        .action-button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        .continue-button {
            -webkit-app-region: no-drag;
            width: 100%;
            height: 34px;
            background: rgba(34, 197, 94, 0.8);
            border: none;
            border-radius: 10px;
            color: white;
            font-size: 12px;
            font-weight: 500;
            cursor: pointer;
            transition: background 0.15s ease;
            position: relative;
            overflow: hidden;
            margin-top: 4px;
        }

        .continue-button::after {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            border-radius: 10px;
            padding: 1px;
            background: linear-gradient(169deg, rgba(255, 255, 255, 0.5) 0%, rgba(255, 255, 255, 0) 50%, rgba(255, 255, 255, 0.5) 100%);
            -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
            -webkit-mask-composite: destination-out;
            mask-composite: exclude;
            pointer-events: none;
        }

        .continue-button:hover:not(:disabled) {
            background: rgba(34, 197, 94, 0.9);
        }

        .continue-button:disabled {
            background: rgba(255, 255, 255, 0.2);
            cursor: not-allowed;
        }
        
        /* ────────────────[ GLASS BYPASS ]─────────────── */
        :host-context(body.has-glass) .container,
        :host-context(body.has-glass) .action-button,
        :host-context(body.has-glass) .continue-button,
        :host-context(body.has-glass) .close-button {
            background: transparent !important;
            border: none !important;
            box-shadow: none !important;
            filter: none !important;
            backdrop-filter: none !important;
        }

        :host-context(body.has-glass) .container::after,
        :host-context(body.has-glass) .action-button::after,
        :host-context(body.has-glass) .continue-button::after {
            display: none !important;
        }

        :host-context(body.has-glass) .action-button:hover,
        :host-context(body.has-glass) .continue-button:hover,
        :host-context(body.has-glass) .close-button:hover {
            background: transparent !important;
        }

        .v4-logo {
            width: 30px;
            height: 30px;
            border-radius: 7px;
            display: block;
            margin: 0 auto 6px auto;
        }
    `;

    static _v4LogoCss = true;

    static properties = {
        microphoneGranted: { type: String },
        screenGranted: { type: String },
        keychainGranted: { type: String },
        isChecking: { type: String },
        continueCallback: { type: Function },
        userMode: { type: String }, // 'local' or 'firebase'
        screenRequested: { type: Boolean }, // usuário já abriu os Ajustes para liberar a tela
        micAutoRequested: { type: Boolean },
    };

    constructor() {
        super();
        this.microphoneGranted = 'unknown';
        this.screenGranted = 'unknown';
        this.keychainGranted = 'unknown';
        this.isChecking = false;
        this.continueCallback = null;
        this.userMode = 'local'; // Default to local
        this.screenRequested = false;
        this.micAutoRequested = false;
    }

    updated(changedProperties) {
        super.updated(changedProperties);
        if (changedProperties.has('userMode') || changedProperties.has('screenRequested')) {
            const base = this.userMode === 'firebase' ? 316 : 256;
            const newHeight = base + (this.screenRequested && this.screenGranted !== 'granted' ? 46 : 0);
            console.log(`[PermissionHeader] Ajustando altura da janela para ${newHeight}px`);
            this.dispatchEvent(new CustomEvent('request-resize', {
                detail: { height: newHeight },
                bubbles: true,
                composed: true
            }));
        }
    }

    async connectedCallback() {
        super.connectedCallback();

        if (window.api) {
            try {
                const userState = await window.api.common.getCurrentUser();
                this.userMode = userState.mode;
            } catch (e) {
                console.error('[PermissionHeader] Failed to get user state', e);
                this.userMode = 'local'; // Fallback to local
            }
        }

        await this.checkPermissions();

        // Pedir o microfone automaticamente na primeira abertura: o macOS mostra
        // o diálogo nativo na hora, sem o closer precisar achar o botão.
        if (!this.micAutoRequested && this.microphoneGranted !== 'granted') {
            this.micAutoRequested = true;
            setTimeout(() => this.handleMicrophoneClick(), 600);
        }

        // Set up periodic permission check
        this.permissionCheckInterval = setInterval(async () => {
            if (window.api) {
                try {
                    const userState = await window.api.common.getCurrentUser();
                    this.userMode = userState.mode;
                } catch (e) {
                    this.userMode = 'local';
                }
            }
            this.checkPermissions();
        }, 1000);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        if (this.permissionCheckInterval) {
            clearInterval(this.permissionCheckInterval);
        }
    }

    async checkPermissions() {
        if (!window.api || this.isChecking) return;
        
        this.isChecking = true;
        
        try {
            const permissions = await window.api.permissionHeader.checkSystemPermissions();
            console.log('[PermissionHeader] Permission check result:', permissions);
            
            const prevMic = this.microphoneGranted;
            const prevScreen = this.screenGranted;
            const prevKeychain = this.keychainGranted;
            
            this.microphoneGranted = permissions.microphone;
            this.screenGranted = permissions.screen;
            this.keychainGranted = permissions.keychain;
            
            // if permissions changed == UI update
            if (prevMic !== this.microphoneGranted || prevScreen !== this.screenGranted || prevKeychain !== this.keychainGranted) {
                console.log('[PermissionHeader] Permission status changed, updating UI');
                this.requestUpdate();
            }

            const isKeychainRequired = this.userMode === 'firebase';
            const keychainOk = !isKeychainRequired || this.keychainGranted === 'granted';
            
            // if all permissions granted == automatically continue
            if (this.microphoneGranted === 'granted' && 
                this.screenGranted === 'granted' && 
                keychainOk && 
                this.continueCallback) {
                console.log('[PermissionHeader] All permissions granted, proceeding automatically');
                setTimeout(() => this.handleContinue(), 500);
            }
        } catch (error) {
            console.error('[PermissionHeader] Error checking permissions:', error);
        } finally {
            this.isChecking = false;
        }
    }

    async handleMicrophoneClick() {
        if (!window.api || this.microphoneGranted === 'granted') return;
        
        console.log('[PermissionHeader] Requesting microphone permission...');
        
        try {
            const result = await window.api.permissionHeader.checkSystemPermissions();
            console.log('[PermissionHeader] Microphone permission result:', result);
            
            if (result.microphone === 'granted') {
                this.microphoneGranted = 'granted';
                this.requestUpdate();
                return;
              }
            
              if (result.microphone === 'not-determined' || result.microphone === 'denied' || result.microphone === 'unknown' || result.microphone === 'restricted') {
                const res = await window.api.permissionHeader.requestMicrophonePermission();
                if (res.status === 'granted' || res.success === true) {
                    this.microphoneGranted = 'granted';
                    this.requestUpdate();
                    return;
                }
              }
            
            
            // Check permissions again after a delay
            // setTimeout(() => this.checkPermissions(), 1000);
        } catch (error) {
            console.error('[PermissionHeader] Error requesting microphone permission:', error);
        }
    }

    async handleScreenClick() {
        if (!window.api || this.screenGranted === 'granted') return;
        
        console.log('[PermissionHeader] Checking screen recording permission...');
        
        try {
            const permissions = await window.api.permissionHeader.checkSystemPermissions();
            console.log('[PermissionHeader] Screen permission check result:', permissions);
            
            if (permissions.screen === 'granted') {
                this.screenGranted = 'granted';
                this.requestUpdate();
                return;
            }
            if (permissions.screen === 'not-determined' || permissions.screen === 'denied' || permissions.screen === 'unknown' || permissions.screen === 'restricted') {
                console.log('[PermissionHeader] Opening screen recording preferences...');
                await window.api.permissionHeader.openSystemPreferences('screen-recording');
                // O macOS só passa a reportar a permissão de tela depois que o app
                // reinicia — mostrar o botão de reiniciar para destravar a jornada.
                this.screenRequested = true;
                this.requestUpdate();
            }
            
            // Check permissions again after a delay
            // (This may not execute if app restarts after permission grant)
            // setTimeout(() => this.checkPermissions(), 2000);
        } catch (error) {
            console.error('[PermissionHeader] Error opening screen recording preferences:', error);
        }
    }

    async handleKeychainClick() {
        if (!window.api || this.keychainGranted === 'granted') return;
        
        console.log('[PermissionHeader] Requesting keychain permission...');
        
        try {
            // Trigger initializeKey to prompt for keychain access
            // Assuming encryptionService is accessible or via API
            await window.api.permissionHeader.initializeEncryptionKey(); // New IPC handler needed
            
            // After success, update status
            this.keychainGranted = 'granted';
            this.requestUpdate();
        } catch (error) {
            console.error('[PermissionHeader] Error requesting keychain permission:', error);
        }
    }

    async handleContinue() {
        const isKeychainRequired = this.userMode === 'firebase';
        const keychainOk = !isKeychainRequired || this.keychainGranted === 'granted';

        if (this.continueCallback && 
            this.microphoneGranted === 'granted' && 
            this.screenGranted === 'granted' && 
            keychainOk) {
            // Mark permissions as completed
            if (window.api && isKeychainRequired) {
                try {
                    await window.api.permissionHeader.markKeychainCompleted();
                    console.log('[PermissionHeader] Marked keychain as completed');
                } catch (error) {
                    console.error('[PermissionHeader] Error marking keychain as completed:', error);
                }
            }
            
            this.continueCallback();
        }
    }

    handleClose() {
        console.log('Close button clicked');
        if (window.api) {
            window.api.common.quitApplication();
        }
    }

    handleRelaunch() {
        console.log('[PermissionHeader] Reiniciando o app para aplicar a permissão de tela...');
        if (window.api?.permissionHeader?.relaunchApp) {
            window.api.permissionHeader.relaunchApp();
        }
    }

    render() {
        const isKeychainRequired = this.userMode === 'firebase';
        const needRestart = this.screenRequested && this.screenGranted !== 'granted';
        const keychainOkForHeight = !isKeychainRequired || this.keychainGranted === 'granted';
        const showWhy =
            !(this.microphoneGranted === 'granted' && this.screenGranted === 'granted' && keychainOkForHeight);
        // A linha do porquê ocupa duas linhas de texto: sem somar aqui, o conteúdo
        // fica cortado (a altura do container é fixada em pixels).
        const containerHeight = (isKeychainRequired ? 316 : 256) + (needRestart ? 46 : 0) + (showWhy ? 32 : 0);
        const keychainOk = !isKeychainRequired || this.keychainGranted === 'granted';
        const allGranted = this.microphoneGranted === 'granted' && this.screenGranted === 'granted' && keychainOk;

        return html`
            <div class="container" style="height: ${containerHeight}px">
                <button class="close-button" @click=${this.handleClose} title="Fechar o aplicativo">
                    <svg width="8" height="8" viewBox="0 0 10 10" fill="currentColor">
                        <path d="M1 1L9 9M9 1L1 9" stroke="currentColor" stroke-width="1.2" />
                    </svg>
                </button>
                <img class="v4-logo" src="data:image/png;base64,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" alt="V4" />
                <h1 class="title">Copiloto V4 — liberar acessos</h1>

                <div class="form-content ${allGranted ? 'all-granted' : ''}">
                    ${!allGranted ? html`
                        <div class="why">
                            O copiloto precisa ouvir a call e ver sua tela para sugerir o próximo passo.
                        </div>
                        <div class="subtitle">Libere o microfone e a gravação de tela${isKeychainRequired ? ' e o keychain' : ''} para continuar</div>

                        <div class="permission-status">
                            <div class="permission-item ${this.microphoneGranted === 'granted' ? 'granted' : ''}">
                                ${this.microphoneGranted === 'granted' ? html`
                                    <svg class="check-icon" viewBox="0 0 20 20" fill="currentColor">
                                        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
                                    </svg>
                                    <span>Microfone ✓</span>
                                ` : html`
                                    <svg class="permission-icon" viewBox="0 0 20 20" fill="currentColor">
                                        <path fill-rule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clip-rule="evenodd" />
                                    </svg>
                                    <span>Microfone</span>
                                `}
                            </div>
                            
                            <div class="permission-item ${this.screenGranted === 'granted' ? 'granted' : ''}">
                                ${this.screenGranted === 'granted' ? html`
                                    <svg class="check-icon" viewBox="0 0 20 20" fill="currentColor">
                                        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
                                    </svg>
                                    <span>Tela ✓</span>
                                ` : html`
                                    <svg class="permission-icon" viewBox="0 0 20 20" fill="currentColor">
                                        <path fill-rule="evenodd" d="M3 5a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2h-2.22l.123.489.804.804A1 1 0 0113 18H7a1 1 0 01-.707-1.707l.804-.804L7.22 15H5a2 2 0 01-2-2V5zm5.771 7H5V5h10v7H8.771z" clip-rule="evenodd" />
                                    </svg>
                                    <span>Gravação de tela</span>
                                `}
                            </div>

                            ${isKeychainRequired ? html`
                                <div class="permission-item ${this.keychainGranted === 'granted' ? 'granted' : ''}">
                                    ${this.keychainGranted === 'granted' ? html`
                                        <svg class="check-icon" viewBox="0 0 20 20" fill="currentColor">
                                            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
                                        </svg>
                                        <span>Data Encryption ✓</span>
                                    ` : html`
                                        <svg class="permission-icon" viewBox="0 0 20 20" fill="currentColor">
                                            <path fill-rule="evenodd" d="M18 8a6 6 0 01-7.744 5.668l-1.649 1.652c-.63.63-1.706.19-1.706-.742V12.18a.75.75 0 00-1.5 0v2.696c0 .932-1.075 1.372-1.706.742l-1.649-1.652A6 6 0 112 8zm-4 0a.75.75 0 00.75-.75A3.75 3.75 0 018.25 4a.75.75 0 000 1.5 2.25 2.25 0 012.25 2.25.75.75 0 00.75.75z" clip-rule="evenodd" />
                                        </svg>
                                        <span>Data Encryption</span>
                                    `}
                                </div>
                            ` : ''}
                        </div>

                        <button 
                            class="action-button" 
                            @click=${this.handleMicrophoneClick}
                            ?disabled=${this.microphoneGranted === 'granted'}
                        >
                            ${this.microphoneGranted === 'granted' ? 'Microfone liberado' : '1. Liberar microfone'}
                        </button>

                        <button
                            class="action-button"
                            @click=${this.handleScreenClick}
                            ?disabled=${this.screenGranted === 'granted'}
                        >
                            ${this.screenGranted === 'granted' ? 'Gravação de tela liberada' : '2. Liberar gravação de tela'}
                        </button>

                        ${needRestart ? html`
                            <button class="continue-button" @click=${this.handleRelaunch}>
                                3. Ativei nos Ajustes — reiniciar o Copiloto
                            </button>
                        ` : ''}

                        ${isKeychainRequired ? html`
                            <button 
                                class="action-button" 
                                @click=${this.handleKeychainClick}
                                ?disabled=${this.keychainGranted === 'granted'}
                            >
                                ${this.keychainGranted === 'granted' ? 'Encryption Enabled' : 'Enable Encryption'}
                            </button>
                            <div class="subtitle" style="visibility: ${this.keychainGranted === 'granted' ? 'hidden' : 'visible'}">
                                Stores the key to encrypt your data. Press "<b>Always Allow</b>" to continue.
                            </div>
                        ` : ''}
                    ` : html`
                        <button 
                            class="continue-button" 
                            @click=${this.handleContinue}
                        >
                            Começar a usar o Copiloto V4
                        </button>
                    `}
                </div>
            </div>
        `;
    }
}

customElements.define('permission-setup', PermissionHeader); 