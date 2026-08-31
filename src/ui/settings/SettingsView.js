import { html, css, svg, LitElement } from '../assets/lit-core-2.7.4.min.js';
// import { getOllamaProgressTracker } from '../../features/common/services/localProgressTracker.js'; // 제거됨

export class SettingsView extends LitElement {
    static styles = css`
        * {
            font-family: 'Helvetica Neue', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            cursor: default;
            user-select: none;
        }

        :host {
            display: block;
            width: 760px;
            height: 100%;
            color: white;
        }

        .settings-container {
            display: flex;
            flex-direction: row;
            height: 100vh;
            width: 100%;
            background: rgba(10, 10, 10, 0.97);
            border-radius: 14px;
            outline: 0.5px rgba(255, 255, 255, 0.16) solid;
            outline-offset: -1px;
            box-sizing: border-box;
            position: relative;
            overflow: hidden;
            padding: 0;
            z-index: 1000;
        }

        /* ── Menu lateral (estilo Perssua) ── */
        .sidebar {
            width: 208px;
            flex-shrink: 0;
            display: flex;
            flex-direction: column;
            gap: 5px;
            padding: 20px 12px 14px 12px;
            border-right: 1px solid rgba(255, 255, 255, 0.08);
            box-sizing: border-box;
            background: rgba(0, 0, 0, 0.35);
        }

        .sidebar-title {
            font-size: 16px;
            font-weight: 700;
            letter-spacing: -0.2px;
            color: white;
            padding: 0 10px 14px 10px;
            margin-bottom: 6px;
        }

        .nav-item {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 9px 10px;
            border-radius: 11px;
            font-size: 13px;
            color: rgba(255, 255, 255, 0.72);
            cursor: pointer;
            border: 1px solid transparent;
            transition: background 0.12s ease, border-color 0.12s ease;
        }

        .nav-icon {
            width: 28px;
            height: 28px;
            flex-shrink: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 8px;
            background: rgba(255, 255, 255, 0.06);
            border: 1px solid rgba(255, 255, 255, 0.08);
        }

        .nav-icon svg {
            width: 15px;
            height: 15px;
        }

        .nav-item:hover {
            background: rgba(255, 255, 255, 0.06);
            color: white;
        }

        .nav-item.active {
            background: rgba(238, 27, 46, 0.13);
            border-color: rgba(238, 27, 46, 0.8);
            color: white;
            font-weight: 600;
        }

        .nav-item.active .nav-icon {
            background: rgba(238, 27, 46, 0.22);
            border-color: rgba(238, 27, 46, 0.5);
        }

        .sidebar-footer {
            margin-top: auto;
            padding-top: 12px;
        }

        .content-area {
            flex: 1;
            overflow-y: auto;
            padding: 24px 26px 20px 26px;
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
            gap: 10px;
        }

        .content-title {
            font-size: 22px;
            font-weight: 700;
            letter-spacing: -0.4px;
            color: white;
            margin: 0 0 2px 0;
            padding-right: 30px;
        }

        .content-hint {
            font-size: 13px;
            color: rgba(255, 255, 255, 0.55);
            line-height: 1.45;
            margin: 0 0 12px 0;
        }

        .close-button {
            position: absolute;
            top: 10px;
            right: 12px;
            width: 22px;
            height: 22px;
            display: flex;
            align-items: center;
            justify-content: center;
            border: none;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.1);
            color: white;
            font-size: 12px;
            cursor: pointer;
            z-index: 10;
        }

        .close-button:hover {
            background: rgba(255, 255, 255, 0.22);
        }

        .content-area::-webkit-scrollbar,
        .settings-container::-webkit-scrollbar {
            width: 6px;
        }

        .content-area::-webkit-scrollbar-track,
        .settings-container::-webkit-scrollbar-track {
            background: rgba(255, 255, 255, 0.05);
            border-radius: 3px;
        }

        .content-area::-webkit-scrollbar-thumb,
        .settings-container::-webkit-scrollbar-thumb {
            background: rgba(255, 255, 255, 0.2);
            border-radius: 3px;
        }

        .content-area::-webkit-scrollbar-thumb:hover,
        .settings-container::-webkit-scrollbar-thumb:hover {
            background: rgba(255, 255, 255, 0.3);
        }

        .settings-container::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.15);
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
            border-radius: 12px;
            filter: blur(10px);
            z-index: -1;
        }
            
        .settings-button[disabled],
        .api-key-section input[disabled] {
            opacity: 0.4;
            cursor: not-allowed;
            pointer-events: none;
        }

        .header-section {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            padding-bottom: 6px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            position: relative;
            z-index: 1;
        }

        .title-line {
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .app-title {
            font-size: 13px;
            font-weight: 500;
            color: white;
            margin: 0 0 4px 0;
        }

        .account-info {
            font-size: 11px;
            color: rgba(255, 255, 255, 0.7);
            margin: 0;
        }

        .invisibility-icon {
            padding-top: 2px;
            opacity: 0;
            transition: opacity 0.3s ease;
        }

        .invisibility-icon.visible {
            opacity: 1;
        }

        .invisibility-icon svg {
            width: 16px;
            height: 16px;
        }

        .shortcuts-section {
            display: flex;
            flex-direction: column;
            gap: 2px;
            padding: 4px 0;
            position: relative;
            z-index: 1;
        }

        .shortcut-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 4px 0;
            color: white;
            font-size: 11px;
        }

        .shortcut-name {
            font-weight: 300;
        }

        .shortcut-keys {
            display: flex;
            align-items: center;
            gap: 3px;
        }

        .cmd-key, .shortcut-key {
            background: rgba(255, 255, 255, 0.1);
            border-radius: 3px;
            width: 16px;
            height: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 11px;
            font-weight: 500;
            color: rgba(255, 255, 255, 0.9);
        }

        /* Buttons Section */
        .buttons-section {
            display: flex;
            flex-direction: column;
            gap: 4px;
            padding-top: 6px;
            border-top: 1px solid rgba(255, 255, 255, 0.1);
            position: relative;
            z-index: 1;
            flex: 1;
        }

        .settings-button {
            background: rgba(255, 255, 255, 0.07);
            border: 1px solid rgba(255, 255, 255, 0.12);
            border-radius: 10px;
            color: white;
            padding: 9px 14px;
            font-size: 12px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.15s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            white-space: nowrap;
        }

        .settings-button:hover {
            background: rgba(255, 255, 255, 0.12);
            border-color: rgba(255, 255, 255, 0.22);
        }

        .settings-button.primary {
            background: white;
            border-color: white;
            color: #111;
            font-weight: 600;
            font-size: 13px;
            border-radius: 999px;
            padding: 11px 18px;
        }

        .settings-button.primary:hover {
            background: rgba(255, 255, 255, 0.88);
        }

        .settings-button:active {
            transform: translateY(1px);
        }

        .settings-button.full-width {
            width: 100%;
        }

        .settings-button.half-width {
            flex: 1;
        }

        .settings-button.danger {
            background: rgba(255, 59, 48, 0.1);
            border-color: rgba(255, 59, 48, 0.3);
            color: rgba(255, 59, 48, 0.9);
        }

        .settings-button.danger:hover {
            background: rgba(255, 59, 48, 0.15);
            border-color: rgba(255, 59, 48, 0.4);
        }

        .move-buttons, .bottom-buttons {
            display: flex;
            gap: 4px;
        }

        .api-key-section {
            padding: 6px 0;
            border-top: 1px solid rgba(255, 255, 255, 0.1);
        }

        .api-key-section input {
            width: 100%;
            background: rgba(0,0,0,0.2);
            border: 1px solid rgba(255,255,255,0.2);
            color: white;
            border-radius: 4px;
            padding: 4px;
            font-size: 11px;
            margin-bottom: 4px;
            box-sizing: border-box;
        }

        .api-key-section input::placeholder {
            color: rgba(255, 255, 255, 0.4);
        }

        /* Preset Management Section */
        .preset-section {
            padding: 6px 0;
            border-top: 1px solid rgba(255, 255, 255, 0.1);
        }

        .preset-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 4px;
        }

        .preset-title {
            font-size: 11px;
            font-weight: 500;
            color: white;
        }

        .preset-count {
            font-size: 9px;
            color: rgba(255, 255, 255, 0.5);
            margin-left: 4px;
        }

        .preset-toggle {
            font-size: 10px;
            color: rgba(255, 255, 255, 0.6);
            cursor: pointer;
            padding: 2px 4px;
            border-radius: 2px;
            transition: background-color 0.15s ease;
        }

        .preset-toggle:hover {
            background: rgba(255, 255, 255, 0.1);
        }

        .preset-list {
            display: flex;
            flex-direction: column;
            gap: 3px;
        }

        .preset-item {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 13px 14px;
            background: rgba(255, 255, 255, 0.035);
            border-radius: 12px;
            cursor: pointer;
            transition: all 0.15s ease;
            font-size: 13px;
            border: 1px solid rgba(255, 255, 255, 0.09);
        }

        .preset-item:hover {
            background: rgba(255, 255, 255, 0.06);
            border-color: rgba(255, 255, 255, 0.2);
        }

        .preset-item.selected {
            background: rgba(238, 27, 46, 0.1);
            border-color: rgba(238, 27, 46, 0.85);
        }

        .preset-check {
            width: 22px;
            height: 22px;
            flex-shrink: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 7px;
            border: 1.5px solid rgba(255, 255, 255, 0.25);
            font-size: 12px;
            font-weight: 700;
            color: white;
            transition: all 0.15s ease;
        }

        .preset-item.selected .preset-check {
            background: #ee1b2e;
            border-color: #ee1b2e;
        }

        .preset-name {
            color: white;
            flex: 1;
            text-overflow: ellipsis;
            overflow: hidden;
            white-space: nowrap;
            font-weight: 500;
        }

        .preset-item.selected .preset-name {
            font-weight: 600;
        }

        .preset-status {
            font-size: 10px;
            font-weight: 600;
            color: #ff8a95;
            background: rgba(238, 27, 46, 0.18);
            padding: 3px 9px;
            border-radius: 999px;
            margin-left: 6px;
        }

        .no-presets-message {
            padding: 16px 10px;
            text-align: center;
            color: rgba(255, 255, 255, 0.5);
            font-size: 12px;
            line-height: 1.5;
        }

        .no-presets-message .web-link {
            color: #ff8a95;
            text-decoration: underline;
            cursor: pointer;
        }

        .no-presets-message .web-link:hover {
            color: rgba(238, 27, 46, 1);
        }

        .loading-state {
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
            color: rgba(255, 255, 255, 0.7);
            font-size: 11px;
        }

        .loading-spinner {
            width: 12px;
            height: 12px;
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-top: 1px solid rgba(255, 255, 255, 0.8);
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin-right: 6px;
        }

        .hidden {
            display: none;
        }

        .api-key-section, .model-selection-section {
            padding: 8px 0;
            border-top: 1px solid rgba(255, 255, 255, 0.1);
            display: flex;
            flex-direction: column;
            gap: 10px;
        }
        .provider-key-group, .model-select-group {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }
        label {
            font-size: 11px;
            font-weight: 500;
            color: rgba(255, 255, 255, 0.8);
            margin-left: 2px;
        }
        label > strong {
            color: white;
            font-weight: 600;
        }
        .provider-key-group input {
            width: 100%; background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.2);
            color: white; border-radius: 4px; padding: 5px 8px; font-size: 11px; box-sizing: border-box;
        }
        .key-buttons { display: flex; gap: 4px; }
        .key-buttons .settings-button { flex: 1; padding: 4px; }
        .model-list {
            display: flex; flex-direction: column; gap: 2px; max-height: 120px;
            overflow-y: auto; background: rgba(0,0,0,0.3); border-radius: 4px;
            padding: 4px; margin-top: 4px;
        }
        .model-item { 
            padding: 5px 8px; 
            font-size: 11px; 
            border-radius: 3px; 
            cursor: pointer; 
            transition: background-color 0.15s; 
            display: flex; 
            justify-content: space-between; 
            align-items: center; 
        }
        .model-item:hover { background-color: rgba(255,255,255,0.1); }
        .model-item.selected { background-color: rgba(238, 27, 46, 0.4); font-weight: 500; }
        .model-status { 
            font-size: 9px; 
            color: rgba(255,255,255,0.6); 
            margin-left: 8px; 
        }
        .model-status.installed { color: rgba(0, 255, 0, 0.8); }
        .model-status.not-installed { color: rgba(255, 200, 0, 0.8); }
        .install-progress {
            flex: 1;
            height: 4px;
            background: rgba(255,255,255,0.1);
            border-radius: 2px;
            margin-left: 8px;
            overflow: hidden;
        }
        .install-progress-bar {
            height: 100%;
            background: rgba(238, 27, 46, 0.8);
            transition: width 0.3s ease;
        }
        
        /* Dropdown styles */
        select.model-dropdown {
            background: rgba(0,0,0,0.2);
            color: white;
            cursor: pointer;
        }
        
        select.model-dropdown option {
            background: #1a1a1a;
            color: white;
        }
        
        select.model-dropdown option:disabled {
            color: rgba(255,255,255,0.4);
        }
            
        /* ────────────────[ GLASS BYPASS ]─────────────── */
        :host-context(body.has-glass) {
            animation: none !important;
            transition: none !important;
            transform: none !important;
            will-change: auto !important;
        }

        :host-context(body.has-glass) * {
            background: transparent !important;
            filter: none !important;
            backdrop-filter: none !important;
            box-shadow: none !important;
            outline: none !important;
            border: none !important;
            border-radius: 0 !important;
            transition: none !important;
            animation: none !important;
        }

        :host-context(body.has-glass) .settings-container::before {
            display: none !important;
        }
    `;


    //////// after_modelStateService ////////
    static properties = {
        shortcuts: { type: Object, state: true },
        firebaseUser: { type: Object, state: true },
        v4Auth: { type: Object, state: true },
        v4LoginError: { type: String, state: true },
        v4LoggingIn: { type: Boolean, state: true },
        isLoading: { type: Boolean, state: true },
        isContentProtectionOn: { type: Boolean, state: true },
        saving: { type: Boolean, state: true },
        providerConfig: { type: Object, state: true },
        apiKeys: { type: Object, state: true },
        availableLlmModels: { type: Array, state: true },
        availableSttModels: { type: Array, state: true },
        selectedLlm: { type: String, state: true },
        selectedStt: { type: String, state: true },
        isLlmListVisible: { type: Boolean },
        isSttListVisible: { type: Boolean },
        activeTab: { type: String, state: true },
        presets: { type: Array, state: true },
        selectedPreset: { type: Object, state: true },
        showPresets: { type: Boolean, state: true },
        autoUpdateEnabled: { type: Boolean, state: true },
        autoUpdateLoading: { type: Boolean, state: true },
        // Ollama related properties
        ollamaStatus: { type: Object, state: true },
        ollamaModels: { type: Array, state: true },
        installingModels: { type: Object, state: true },
        // Whisper related properties
        whisperModels: { type: Array, state: true },
    };
    //////// after_modelStateService ////////

    constructor() {
        super();
        //////// after_modelStateService ////////
        this.shortcuts = {};
        this.firebaseUser = null;
        this.apiKeys = { openai: '', gemini: '', anthropic: '', whisper: '' };
        this.providerConfig = {};
        this.isLoading = true;
        this.isContentProtectionOn = true;
        this.saving = false;
        this.availableLlmModels = [];
        this.availableSttModels = [];
        this.selectedLlm = null;
        this.selectedStt = null;
        this.isLlmListVisible = false;
        this.isSttListVisible = false;
        this.presets = [];
        this.selectedPreset = null;
        this.showPresets = false;
        this.activeTab = 'agentes';
        // Ollama related
        this.ollamaStatus = { installed: false, running: false };
        this.ollamaModels = [];
        this.installingModels = {}; // { modelName: progress }
        // Whisper related
        this.whisperModels = [];
        this.whisperProgressTracker = null; // Will be initialized when needed
        this.handleUsePicklesKey = this.handleUsePicklesKey.bind(this)
        this.autoUpdateEnabled = true;
        this.autoUpdateLoading = true;
        this.loadInitialData();
        //////// after_modelStateService ////////
    }

    async loadAutoUpdateSetting() {
        if (!window.api) return;
        this.autoUpdateLoading = true;
        try {
            const enabled = await window.api.settingsView.getAutoUpdate();
            this.autoUpdateEnabled = enabled;
            console.log('Auto-update setting loaded:', enabled);
        } catch (e) {
            console.error('Error loading auto-update setting:', e);
            this.autoUpdateEnabled = true; // fallback
        }
        this.autoUpdateLoading = false;
        this.requestUpdate();
    }

    async handleToggleAutoUpdate() {
        if (!window.api || this.autoUpdateLoading) return;
        this.autoUpdateLoading = true;
        this.requestUpdate();
        try {
            const newValue = !this.autoUpdateEnabled;
            const result = await window.api.settingsView.setAutoUpdate(newValue);
            if (result && result.success) {
                this.autoUpdateEnabled = newValue;
            } else {
                console.error('Failed to update auto-update setting');
            }
        } catch (e) {
            console.error('Error toggling auto-update:', e);
        }
        this.autoUpdateLoading = false;
        this.requestUpdate();
    }

    async loadLocalAIStatus() {
        try {
            // Load Ollama status
            const ollamaStatus = await window.api.settingsView.getOllamaStatus();
            if (ollamaStatus?.success) {
                this.ollamaStatus = { installed: ollamaStatus.installed, running: ollamaStatus.running };
                this.ollamaModels = ollamaStatus.models || [];
            }
            
            // Load Whisper models status only if Whisper is enabled
            if (this.apiKeys?.whisper === 'local') {
                const whisperModelsResult = await window.api.settingsView.getWhisperInstalledModels();
                if (whisperModelsResult?.success) {
                    const installedWhisperModels = whisperModelsResult.models;
                    if (this.providerConfig?.whisper) {
                        this.providerConfig.whisper.sttModels.forEach(m => {
                            const installedInfo = installedWhisperModels.find(i => i.id === m.id);
                            if (installedInfo) {
                                m.installed = installedInfo.installed;
                            }
                        });
                    }
                }
            }
            
            // Trigger UI update
            this.requestUpdate();
        } catch (error) {
            console.error('Error loading LocalAI status:', error);
        }
    }

    //////// after_modelStateService ////////
    async loadInitialData() {
        if (!window.api) return;
        this.isLoading = true;
        try {
            // Load essential data first
            const [userState, modelSettings, presets, contentProtection, shortcuts] = await Promise.all([
                window.api.settingsView.getCurrentUser(),
                window.api.settingsView.getModelSettings(), // Facade call
                window.api.settingsView.getPresets(),
                window.api.settingsView.getContentProtectionStatus(),
                window.api.settingsView.getCurrentShortcuts()
            ]);
            
            if (userState && userState.isLoggedIn) this.firebaseUser = userState;
            
            if (modelSettings.success) {
                const { config, storedKeys, availableLlm, availableStt, selectedModels } = modelSettings.data;
                this.providerConfig = config;
                this.apiKeys = storedKeys;
                this.availableLlmModels = availableLlm;
                this.availableSttModels = availableStt;
                this.selectedLlm = selectedModels.llm;
                this.selectedStt = selectedModels.stt;
            }

            this.presets = presets || [];
            this.isContentProtectionOn = contentProtection;
            this.shortcuts = shortcuts || {};
            this.selectedPreset = this.presets.find(p => p.is_active === 1) || null;
            
            // Load LocalAI status asynchronously to improve initial load time
            this.loadLocalAIStatus();
        } catch (error) {
            console.error('Error loading initial settings data:', error);
        } finally {
            this.isLoading = false;
        }
    }


    async loadV4AuthState() {
        try {
            this.v4Auth = await window.api.settingsView.v4GetState();
        } catch (_) {
            this.v4Auth = { loggedIn: false, email: null };
        }
    }

    async handleV4Login() {
        const email = this.shadowRoot.querySelector('#v4-email')?.value || '';
        const password = this.shadowRoot.querySelector('#v4-password')?.value || '';
        if (!email || !password) {
            this.v4LoginError = 'Informe e-mail e senha.';
            return;
        }
        this.v4LoggingIn = true;
        this.v4LoginError = '';
        try {
            const result = await window.api.settingsView.v4Login(email, password);
            if (result.success) {
                await this.loadV4AuthState();
            } else {
                this.v4LoginError = result.error || 'Falha no login.';
            }
        } catch (err) {
            this.v4LoginError = err.message;
        } finally {
            this.v4LoggingIn = false;
        }
    }

    async handleV4Logout() {
        await window.api.settingsView.v4Logout();
        await this.loadV4AuthState();
    }

    async handleSaveKey(provider) {
        const input = this.shadowRoot.querySelector(`#key-input-${provider}`);
        if (!input) return;
        const key = input.value;
        
        // For Ollama, we need to ensure it's ready first
        if (provider === 'ollama') {
        this.saving = true;
            
            // First ensure Ollama is installed and running
            const ensureResult = await window.api.settingsView.ensureOllamaReady();
            if (!ensureResult.success) {
                alert(`Failed to setup Ollama: ${ensureResult.error}`);
                this.saving = false;
                return;
            }
            
            // Now validate (which will check if service is running)
            const result = await window.api.settingsView.validateKey({ provider, key: 'local' });
            
            if (result.success) {
                await this.refreshModelData();
                await this.refreshOllamaStatus();
            } else {
                alert(`Failed to connect to Ollama: ${result.error}`);
            }
            this.saving = false;
            return;
        }
        
        // For Whisper, just enable it
        if (provider === 'whisper') {
            this.saving = true;
            const result = await window.api.settingsView.validateKey({ provider, key: 'local' });
            
            if (result.success) {
                await this.refreshModelData();
            } else {
                alert(`Failed to enable Whisper: ${result.error}`);
            }
            this.saving = false;
            return;
        }
        
        // For other providers, use the normal flow
        this.saving = true;
        const result = await window.api.settingsView.validateKey({ provider, key });
        
        if (result.success) {
            await this.refreshModelData();
        } else {
            alert(`Failed to save ${provider} key: ${result.error}`);
            input.value = this.apiKeys[provider] || '';
        }
        this.saving = false;
    }
    
    async handleClearKey(provider) {
        console.log(`[SettingsView] handleClearKey: ${provider}`);
        this.saving = true;
        await window.api.settingsView.removeApiKey(provider);
        this.apiKeys = { ...this.apiKeys, [provider]: '' };
        await this.refreshModelData();
        this.saving = false;
    }

    async refreshModelData() {
        const [availableLlm, availableStt, selected, storedKeys] = await Promise.all([
            window.api.settingsView.getAvailableModels({ type: 'llm' }),
            window.api.settingsView.getAvailableModels({ type: 'stt' }),
            window.api.settingsView.getSelectedModels(),
            window.api.settingsView.getAllKeys()
        ]);
        this.availableLlmModels = availableLlm;
        this.availableSttModels = availableStt;
        this.selectedLlm = selected.llm;
        this.selectedStt = selected.stt;
        this.apiKeys = storedKeys;
        this.requestUpdate();
    }
    
    async toggleModelList(type) {
        const visibilityProp = type === 'llm' ? 'isLlmListVisible' : 'isSttListVisible';

        if (!this[visibilityProp]) {
            this.saving = true;
            this.requestUpdate();
            
            await this.refreshModelData();

            this.saving = false;
        }

        // 데이터 새로고침 후, 목록의 표시 상태를 토글합니다.
        this[visibilityProp] = !this[visibilityProp];
        this.requestUpdate();
    }
    
    async selectModel(type, modelId) {
        // Check if this is an Ollama model that needs to be installed
        const provider = this.getProviderForModel(type, modelId);
        if (provider === 'ollama') {
            const ollamaModel = this.ollamaModels.find(m => m.name === modelId);
            if (ollamaModel && !ollamaModel.installed && !ollamaModel.installing) {
                // Need to install the model first
                await this.installOllamaModel(modelId);
                return;
            }
        }
        
        // Check if this is a Whisper model that needs to be downloaded
        if (provider === 'whisper' && type === 'stt') {
            const isInstalling = this.installingModels[modelId] !== undefined;
            const whisperModelInfo = this.providerConfig.whisper.sttModels.find(m => m.id === modelId);
            
            if (whisperModelInfo && !whisperModelInfo.installed && !isInstalling) {
                await this.downloadWhisperModel(modelId);
                return;
            }
        }
        
        this.saving = true;
        await window.api.settingsView.setSelectedModel({ type, modelId });
        if (type === 'llm') this.selectedLlm = modelId;
        if (type === 'stt') this.selectedStt = modelId;
        this.isLlmListVisible = false;
        this.isSttListVisible = false;
        this.saving = false;
        this.requestUpdate();
    }
    
    async refreshOllamaStatus() {
        const ollamaStatus = await window.api.settingsView.getOllamaStatus();
        if (ollamaStatus?.success) {
            this.ollamaStatus = { installed: ollamaStatus.installed, running: ollamaStatus.running };
            this.ollamaModels = ollamaStatus.models || [];
        }
    }
    
    async installOllamaModel(modelName) {
        try {
            // Ollama 모델 다운로드 시작
            this.installingModels = { ...this.installingModels, [modelName]: 0 };
            this.requestUpdate();

            // 진행률 이벤트 리스너 설정 - 통합 LocalAI 이벤트 사용
            const progressHandler = (event, data) => {
                if (data.service === 'ollama' && data.model === modelName) {
                    this.installingModels = { ...this.installingModels, [modelName]: data.progress || 0 };
                    this.requestUpdate();
                }
            };

            // 통합 LocalAI 이벤트 리스너 등록
            window.api.settingsView.onLocalAIInstallProgress(progressHandler);

            try {
                const result = await window.api.settingsView.pullOllamaModel(modelName);
                
                if (result.success) {
                    console.log(`[SettingsView] Model ${modelName} installed successfully`);
                    delete this.installingModels[modelName];
                    this.requestUpdate();
                    
                    // 상태 새로고침
                    await this.refreshOllamaStatus();
                    await this.refreshModelData();
                } else {
                    throw new Error(result.error || 'Installation failed');
                }
            } finally {
                // 통합 LocalAI 이벤트 리스너 제거
                window.api.settingsView.removeOnLocalAIInstallProgress(progressHandler);
            }
        } catch (error) {
            console.error(`[SettingsView] Error installing model ${modelName}:`, error);
            delete this.installingModels[modelName];
            this.requestUpdate();
        }
    }
    
    async downloadWhisperModel(modelId) {
        // Mark as installing
        this.installingModels = { ...this.installingModels, [modelId]: 0 };
        this.requestUpdate();
        
        try {
            // Set up progress listener - 통합 LocalAI 이벤트 사용
            const progressHandler = (event, data) => {
                if (data.service === 'whisper' && data.model === modelId) {
                    this.installingModels = { ...this.installingModels, [modelId]: data.progress || 0 };
                    this.requestUpdate();
                }
            };
            
            window.api.settingsView.onLocalAIInstallProgress(progressHandler);
            
            // Start download
            const result = await window.api.settingsView.downloadWhisperModel(modelId);
            
            if (result.success) {
                // Update the model's installed status
                if (this.providerConfig?.whisper?.sttModels) {
                    const modelInfo = this.providerConfig.whisper.sttModels.find(m => m.id === modelId);
                    if (modelInfo) {
                        modelInfo.installed = true;
                    }
                }
                
                // Remove from installing models
                delete this.installingModels[modelId];
                this.requestUpdate();
                
                // Reload LocalAI status to get fresh data
                await this.loadLocalAIStatus();
                
                // Auto-select the model after download
                await this.selectModel('stt', modelId);
            } else {
                // Remove from installing models on failure too
                delete this.installingModels[modelId];
                this.requestUpdate();
                alert(`Failed to download Whisper model: ${result.error}`);
            }
            
            // Cleanup
            window.api.settingsView.removeOnLocalAIInstallProgress(progressHandler);
        } catch (error) {
            console.error(`[SettingsView] Error downloading Whisper model ${modelId}:`, error);
            // Remove from installing models on error
            delete this.installingModels[modelId];
            this.requestUpdate();
            alert(`Error downloading ${modelId}: ${error.message}`);
        }
    }
    
    getProviderForModel(type, modelId) {
        for (const [providerId, config] of Object.entries(this.providerConfig)) {
            const models = type === 'llm' ? config.llmModels : config.sttModels;
            if (models?.some(m => m.id === modelId)) {
                return providerId;
            }
        }
        return null;
    }


    handleUsePicklesKey(e) {
        e.preventDefault()
        if (this.wasJustDragged) return
    
        console.log("Requesting Firebase authentication from main process...")
        window.api.settingsView.startFirebaseAuth();
    }
    //////// after_modelStateService ////////

    openShortcutEditor() {
        window.api.settingsView.openShortcutSettingsWindow();
    }

    connectedCallback() {
        super.connectedCallback();

        this.setupEventListeners();
        this.setupIpcListeners();
        this.setupWindowResize();
        this.loadAutoUpdateSetting();
        this.loadV4AuthState();
        // Force one height calculation immediately (innerHeight may be 0 at first)
        setTimeout(() => this.updateScrollHeight(), 0);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this.cleanupEventListeners();
        this.cleanupIpcListeners();
        this.cleanupWindowResize();
        
        // Cancel any ongoing Ollama installations when component is destroyed
        const installingModels = Object.keys(this.installingModels);
        if (installingModels.length > 0) {
            installingModels.forEach(modelName => {
                window.api.settingsView.cancelOllamaInstallation(modelName);
            });
        }
    }

    setupEventListeners() {
        // A janela agora abre/fecha por clique (engrenagem do header e botão ✕),
        // então não há mais auto-hide por hover.
    }

    cleanupEventListeners() {}

    handleClose() {
        if (window.api) {
            window.api.settingsView.hideSettingsWindow();
        }
    }

    setupIpcListeners() {
        if (!window.api) return;
        
        this._userStateListener = (event, userState) => {
            console.log('[SettingsView] Received user-state-changed:', userState);
            if (userState && userState.isLoggedIn) {
                this.firebaseUser = userState;
            } else {
                this.firebaseUser = null;
            }
            this.loadAutoUpdateSetting();
            // Reload model settings when user state changes (Firebase login/logout)
            this.loadInitialData();
        };
        
        this._settingsUpdatedListener = (event, settings) => {
            console.log('[SettingsView] Received settings-updated');
            this.settings = settings;
            this.requestUpdate();
        };

        // 프리셋 업데이트 리스너 추가
        this._presetsUpdatedListener = async (event) => {
            console.log('[SettingsView] Received presets-updated, refreshing presets');
            try {
                const presets = await window.api.settingsView.getPresets();
                this.presets = presets || [];
                this.selectedPreset = this.presets.find(p => p.is_active === 1) || null;
                this.requestUpdate();
            } catch (error) {
                console.error('[SettingsView] Failed to refresh presets:', error);
            }
        };
        this._shortcutListener = (event, keybinds) => {
            console.log('[SettingsView] Received updated shortcuts:', keybinds);
            this.shortcuts = keybinds;
        };
        
        window.api.settingsView.onUserStateChanged(this._userStateListener);
        window.api.settingsView.onSettingsUpdated(this._settingsUpdatedListener);
        window.api.settingsView.onPresetsUpdated(this._presetsUpdatedListener);
        window.api.settingsView.onShortcutsUpdated(this._shortcutListener);
    }

    cleanupIpcListeners() {
        if (!window.api) return;
        
        if (this._userStateListener) {
            window.api.settingsView.removeOnUserStateChanged(this._userStateListener);
        }
        if (this._settingsUpdatedListener) {
            window.api.settingsView.removeOnSettingsUpdated(this._settingsUpdatedListener);
        }
        if (this._presetsUpdatedListener) {
            window.api.settingsView.removeOnPresetsUpdated(this._presetsUpdatedListener);
        }
        if (this._shortcutListener) {
            window.api.settingsView.removeOnShortcutsUpdated(this._shortcutListener);
        }
    }

    setupWindowResize() {
        this.resizeHandler = () => {
            this.requestUpdate();
            this.updateScrollHeight();
        };
        window.addEventListener('resize', this.resizeHandler);
        
        // Initial setup
        setTimeout(() => this.updateScrollHeight(), 100);
    }

    cleanupWindowResize() {
        if (this.resizeHandler) {
            window.removeEventListener('resize', this.resizeHandler);
        }
    }

    updateScrollHeight() {
        // Electron 일부 시점에서 window.innerHeight 가 0 으로 보고되는 버그 보호
        const rawHeight = window.innerHeight || (window.screen ? window.screen.height : 0);
        const MIN_HEIGHT = 300; // 최소 보장 높이
        const maxHeight = Math.max(MIN_HEIGHT, rawHeight);

        this.style.maxHeight = `${maxHeight}px`;

        const container = this.shadowRoot?.querySelector('.settings-container');
        if (container) {
            container.style.maxHeight = `${maxHeight}px`;
        }
    }

    handleMouseEnter = () => {
        window.api.settingsView.cancelHideSettingsWindow();
        // Recalculate height in case it was set to 0 before
        this.updateScrollHeight();
    }

    handleMouseLeave = () => {
        window.api.settingsView.hideSettingsWindow();
    }


    getMainShortcuts() {
        return [
            { name: 'Show / Hide', accelerator: this.shortcuts.toggleVisibility },
            { name: 'Ask Anything', accelerator: this.shortcuts.nextStep },
            { name: 'Scroll Up Response', accelerator: this.shortcuts.scrollUp },
            { name: 'Scroll Down Response', accelerator: this.shortcuts.scrollDown },
        ];
    }

    renderShortcutKeys(accelerator) {
        if (!accelerator) return html`N/A`;
        
        const keyMap = {
            'Cmd': '⌘', 'Command': '⌘', 'Ctrl': '⌃', 'Alt': '⌥', 'Shift': '⇧', 'Enter': '↵',
            'Up': '↑', 'Down': '↓', 'Left': '←', 'Right': '→'
        };

        // scrollDown/scrollUp의 특수 처리
        if (accelerator.includes('↕')) {
            const keys = accelerator.replace('↕','').split('+');
            keys.push('↕');
             return html`${keys.map(key => html`<span class="shortcut-key">${keyMap[key] || key}</span>`)}`;
        }

        const keys = accelerator.split('+');
        return html`${keys.map(key => html`<span class="shortcut-key">${keyMap[key] || key}</span>`)}`;
    }

    togglePresets() {
        this.showPresets = !this.showPresets;
    }

    async handlePresetSelect(preset) {
        // Clicar no agente ativo desativa; clicar em outro ativa.
        const newActiveId = preset.is_active === 1 ? null : preset.id;
        try {
            await window.api.settingsView.setActivePreset(newActiveId);
            this.presets = this.presets.map(p => ({ ...p, is_active: p.id === newActiveId ? 1 : 0 }));
            this.selectedPreset = newActiveId ? { ...preset, is_active: 1 } : null;
            this.requestUpdate();
        } catch (error) {
            console.error('[SettingsView] Failed to set active agent:', error);
        }
    }

    handleMoveLeft() {
        console.log('Move Left clicked');
        window.api.settingsView.moveWindowStep('left');
    }

    handleMoveRight() {
        console.log('Move Right clicked');
        window.api.settingsView.moveWindowStep('right');
    }

    async handlePersonalize() {
        console.log('Personalize clicked');
        try {
            await window.api.settingsView.openPersonalizePage();
        } catch (error) {
            console.error('Failed to open personalize page:', error);
        }
    }

    async handleToggleInvisibility() {
        console.log('Toggle Invisibility clicked');
        this.isContentProtectionOn = await window.api.settingsView.toggleContentProtection();
        this.requestUpdate();
    }

    async handleSaveApiKey() {
        const input = this.shadowRoot.getElementById('api-key-input');
        if (!input || !input.value) return;

        const newApiKey = input.value;
        try {
            const result = await window.api.settingsView.saveApiKey(newApiKey);
            if (result.success) {
                console.log('API Key saved successfully via IPC.');
                this.apiKey = newApiKey;
                this.requestUpdate();
            } else {
                 console.error('Failed to save API Key via IPC:', result.error);
            }
        } catch(e) {
            console.error('Error invoking save-api-key IPC:', e);
        }
    }

    handleQuit() {
        console.log('Quit clicked');
        window.api.settingsView.quitApplication();
    }

    handleFirebaseLogout() {
        console.log('Firebase Logout clicked');
        window.api.settingsView.firebaseLogout();
    }

    async handleOllamaShutdown() {
        console.log('[SettingsView] Shutting down Ollama service...');
        
        if (!window.api) return;
        
        try {
            // Show loading state
            this.ollamaStatus = { ...this.ollamaStatus, running: false };
            this.requestUpdate();
            
            const result = await window.api.settingsView.shutdownOllama(false); // Graceful shutdown
            
            if (result.success) {
                console.log('[SettingsView] Ollama shut down successfully');
                // Refresh status to reflect the change
                await this.refreshOllamaStatus();
            } else {
                console.error('[SettingsView] Failed to shutdown Ollama:', result.error);
                // Restore previous state on error
                await this.refreshOllamaStatus();
            }
        } catch (error) {
            console.error('[SettingsView] Error during Ollama shutdown:', error);
            // Restore previous state on error
            await this.refreshOllamaStatus();
        }
    }

    //////// after_modelStateService ////////
    render() {
        if (this.isLoading) {
            return html`
                <div class="settings-container">
                    <div class="loading-state">
                        <div class="loading-spinner"></div>
                        <span>Loading...</span>
                    </div>
                </div>
            `;
        }

        const loggedIn = !!this.firebaseUser;

        const v4AuthHTML = html`
            <div class="api-key-section">
                ${this.v4Auth?.loggedIn
                    ? html`
                          <div style="font-size: 11px; color: rgba(120,220,140,0.95); margin-bottom: 4px;">
                              Conta V4: ${this.v4Auth.email}
                          </div>
                          <button class="settings-button full-width" @click=${() => this.handleV4Logout()}>Sair da conta V4</button>
                      `
                    : html`
                          <div style="font-size: 11px; font-weight: 600; margin-bottom: 4px;">Login V4 Amaral</div>
                          <input type="email" id="v4-email" placeholder="e-mail corporativo" />
                          <input type="password" id="v4-password" placeholder="senha" />
                          ${this.v4LoginError
                              ? html`<div style="font-size: 10px; color: rgba(255,120,120,0.95); margin-bottom: 4px;">${this.v4LoginError}</div>`
                              : ''}
                          <button class="settings-button full-width" ?disabled=${this.v4LoggingIn} @click=${() => this.handleV4Login()}>
                              ${this.v4LoggingIn ? 'Entrando…' : 'Entrar'}
                          </button>
                      `}
            </div>
        `;

        const apiKeyManagementHTML = html`
            <div class="api-key-section">
                ${Object.entries(this.providerConfig)
                    .filter(([id, config]) => !id.includes('-glass'))
                    .map(([id, config]) => {
                        if (id === 'ollama') {
                            // Special UI for Ollama
                            return html`
                                <div class="provider-key-group">
                                    <label>${config.name} (Local)</label>
                                    ${this.ollamaStatus.installed && this.ollamaStatus.running ? html`
                                        <div style="padding: 8px; background: rgba(0,255,0,0.1); border-radius: 4px; font-size: 11px; color: rgba(0,255,0,0.8);">
                                            ✓ Ollama is running
                                        </div>
                                        <button class="settings-button full-width danger" @click=${this.handleOllamaShutdown}>
                                            Stop Ollama Service
                                        </button>
                                    ` : this.ollamaStatus.installed ? html`
                                        <div style="padding: 8px; background: rgba(255,200,0,0.1); border-radius: 4px; font-size: 11px; color: rgba(255,200,0,0.8);">
                                            ⚠ Ollama installed but not running
                                        </div>
                                        <button class="settings-button full-width" @click=${() => this.handleSaveKey(id)}>
                                            Start Ollama
                                        </button>
                                    ` : html`
                                        <div style="padding: 8px; background: rgba(255,100,100,0.1); border-radius: 4px; font-size: 11px; color: rgba(255,100,100,0.8);">
                                            ✗ Ollama not installed
                                        </div>
                                        <button class="settings-button full-width" @click=${() => this.handleSaveKey(id)}>
                                            Install & Setup Ollama
                                        </button>
                                    `}
                                </div>
                            `;
                        }
                        
                        if (id === 'whisper') {
                            // Simplified UI for Whisper without model selection
                            return html`
                                <div class="provider-key-group">
                                    <label>${config.name} (Local STT)</label>
                                    ${this.apiKeys[id] === 'local' ? html`
                                        <div style="padding: 8px; background: rgba(0,255,0,0.1); border-radius: 4px; font-size: 11px; color: rgba(0,255,0,0.8); margin-bottom: 8px;">
                                            ✓ Whisper is enabled
                                        </div>
                                        <button class="settings-button full-width danger" @click=${() => this.handleClearKey(id)}>
                                            Disable Whisper
                                        </button>
                                    ` : html`
                                        <button class="settings-button full-width" @click=${() => this.handleSaveKey(id)}>
                                            Enable Whisper STT
                                        </button>
                                    `}
                                </div>
                            `;
                        }
                        
                        // Regular providers
                        return html`
                        <div class="provider-key-group">
                            <label for="key-input-${id}">${config.name} API Key</label>
                            <input type="password" id="key-input-${id}"
                                placeholder=${loggedIn ? "Using Pickle's Key" : `Enter ${config.name} API Key`} 
                                .value=${this.apiKeys[id] || ''}
                            >
                            <div class="key-buttons">
                               <button class="settings-button" @click=${() => this.handleSaveKey(id)} >Save</button>
                               <button class="settings-button danger" @click=${() => this.handleClearKey(id)} }>Clear</button>
                            </div>
                        </div>
                        `;
                    })}
            </div>
        `;
        
        const getModelName = (type, id) => {
            const models = type === 'llm' ? this.availableLlmModels : this.availableSttModels;
            const model = models.find(m => m.id === id);
            return model ? model.name : id;
        }

        const modelSelectionHTML = html`
            <div class="model-selection-section">
                <div class="model-select-group">
                    <label>LLM Model: <strong>${getModelName('llm', this.selectedLlm) || 'Not Set'}</strong></label>
                    <button class="settings-button full-width" @click=${() => this.toggleModelList('llm')} ?disabled=${this.saving || this.availableLlmModels.length === 0}>
                        Change LLM Model
                    </button>
                    ${this.isLlmListVisible ? html`
                        <div class="model-list">
                            ${this.availableLlmModels.map(model => {
                                const isOllama = this.getProviderForModel('llm', model.id) === 'ollama';
                                const ollamaModel = isOllama ? this.ollamaModels.find(m => m.name === model.id) : null;
                                const isInstalling = this.installingModels[model.id] !== undefined;
                                const installProgress = this.installingModels[model.id] || 0;
                                
                                return html`
                                    <div class="model-item ${this.selectedLlm === model.id ? 'selected' : ''}" 
                                         @click=${() => this.selectModel('llm', model.id)}>
                                        <span>${model.name}</span>
                                        ${isOllama ? html`
                                            ${isInstalling ? html`
                                                <div class="install-progress">
                                                    <div class="install-progress-bar" style="width: ${installProgress}%"></div>
                                </div>
                                            ` : ollamaModel?.installed ? html`
                                                <span class="model-status installed">✓ Installed</span>
                                            ` : html`
                                                <span class="model-status not-installed">Click to install</span>
                                            `}
                                        ` : ''}
                                    </div>
                                `;
                            })}
                        </div>
                    ` : ''}
                </div>
                <div class="model-select-group">
                    <label>STT Model: <strong>${getModelName('stt', this.selectedStt) || 'Not Set'}</strong></label>
                    <button class="settings-button full-width" @click=${() => this.toggleModelList('stt')} ?disabled=${this.saving || this.availableSttModels.length === 0}>
                        Change STT Model
                    </button>
                    ${this.isSttListVisible ? html`
                        <div class="model-list">
                            ${this.availableSttModels.map(model => {
                                const isWhisper = this.getProviderForModel('stt', model.id) === 'whisper';
                                const whisperModel = isWhisper && this.providerConfig?.whisper?.sttModels 
                                    ? this.providerConfig.whisper.sttModels.find(m => m.id === model.id) 
                                    : null;
                                const isInstalling = this.installingModels[model.id] !== undefined;
                                const installProgress = this.installingModels[model.id] || 0;
                                
                                return html`
                                    <div class="model-item ${this.selectedStt === model.id ? 'selected' : ''}" 
                                         @click=${() => this.selectModel('stt', model.id)}>
                                        <span>${model.name}</span>
                                        ${isWhisper ? html`
                                            ${isInstalling ? html`
                                                <div class="install-progress">
                                                    <div class="install-progress-bar" style="width: ${installProgress}%"></div>
                                                </div>
                                            ` : whisperModel?.installed ? html`
                                                <span class="model-status installed">✓ Installed</span>
                                            ` : html`
                                                <span class="model-status not-installed">Not Installed</span>
                                            `}
                                        ` : ''}
                                    </div>
                                `;
                            })}
                        </div>
                    ` : ''}
                </div>
            </div>
        `;

        const icon = (paths) => html`
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>
        `;

        const tabs = [
            { id: 'agentes', label: 'Agentes', icon: icon(svg`<path d="M12 3l1.9 4.9L19 9.8l-4.6 1.6L12 16.5l-2.4-5.1L5 9.8l5.1-1.9L12 3z"/><path d="M18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2z"/>`) },
            { id: 'conta', label: 'Conta', icon: icon(svg`<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20c.8-3.2 3.6-5 7-5s6.2 1.8 7 5"/>`) },
            { id: 'modelos', label: 'Modelos & API', icon: icon(svg`<rect x="5.5" y="5.5" width="13" height="13" rx="2.5"/><rect x="9.5" y="9.5" width="5" height="5" rx="1"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"/>`) },
            { id: 'atalhos', label: 'Atalhos', icon: icon(svg`<rect x="3" y="6.5" width="18" height="11" rx="2.5"/><path d="M7.5 14h9M7 10.5h.01M10.5 10.5h.01M14 10.5h.01M17 10.5h.01"/>`) },
            { id: 'geral', label: 'Geral', icon: icon(svg`<path d="M4 8h9M17.5 8H20M4 16h2.5M11 16h9"/><circle cx="15" cy="8" r="2.2"/><circle cx="8.5" cy="16" r="2.2"/>`) },
        ];

        const agentesPane = html`
            <h2 class="content-title">Agentes</h2>
            <p class="content-hint">
                O agente ativo guia as sugestões ao vivo durante a call.
                Clique para ativar; clique no ativo para voltar ao playbook padrão (Closer).
            </p>
            <div class="preset-list">
                ${this.presets.length === 0 ? html`
                    <div class="no-presets-message">
                        Nenhum agente ainda.<br>
                        <span class="web-link" @click=${this.handlePersonalize}>
                            Criar seu primeiro agente
                        </span>
                    </div>
                ` : this.presets.map(preset => html`
                    <div class="preset-item ${preset.is_active === 1 ? 'selected' : ''}"
                         @click=${() => this.handlePresetSelect(preset)}>
                        <span class="preset-check">${preset.is_active === 1 ? '✓' : ''}</span>
                        <span class="preset-name">${preset.title}</span>
                        ${preset.is_active === 1 ? html`<span class="preset-status">Ativo</span>` : ''}
                    </div>
                `)}
            </div>
            <div class="buttons-section">
                <button class="settings-button primary full-width" @click=${this.handlePersonalize}>
                    <span>Criar / editar agentes</span>
                </button>
            </div>
        `;

        const contaPane = html`
            <h2 class="content-title">Conta</h2>
            <div class="account-info" style="margin-bottom: 8px;">
                ${this.firebaseUser
                    ? html`Conta: ${this.firebaseUser.email || 'conectada'}`
                    : 'Conta: não conectada'}
            </div>
            ${v4AuthHTML}
            <div class="buttons-section">
                ${this.firebaseUser
                    ? html`
                        <button class="settings-button full-width danger" @click=${this.handleFirebaseLogout}>
                            <span>Logout</span>
                        </button>`
                    : html`
                        <button class="settings-button full-width" @click=${this.handleUsePicklesKey}>
                            <span>Login</span>
                        </button>`
                }
            </div>
        `;

        const modelosPane = html`
            <h2 class="content-title">Modelos & API</h2>
            ${apiKeyManagementHTML}
            ${modelSelectionHTML}
        `;

        const atalhosPane = html`
            <h2 class="content-title">Atalhos</h2>
            <div class="shortcuts-section">
                ${this.getMainShortcuts().map(shortcut => html`
                    <div class="shortcut-item">
                        <span class="shortcut-name">${shortcut.name}</span>
                        <div class="shortcut-keys">
                            ${this.renderShortcutKeys(shortcut.accelerator)}
                        </div>
                    </div>
                `)}
            </div>
            <div class="buttons-section">
                <button class="settings-button full-width" @click=${this.openShortcutEditor}>
                    Editar atalhos
                </button>
            </div>
        `;

        const geralPane = html`
            <h2 class="content-title">Geral</h2>
            <div class="buttons-section">
                <button class="settings-button full-width" @click=${this.handleToggleAutoUpdate} ?disabled=${this.autoUpdateLoading}>
                    <span>Atualizações automáticas: ${this.autoUpdateEnabled ? 'Ativadas' : 'Desativadas'}</span>
                </button>
                <button class="settings-button full-width" @click=${this.handleToggleInvisibility}>
                    <span>${this.isContentProtectionOn ? 'Desativar invisibilidade' : 'Ativar invisibilidade'}</span>
                </button>
                <div class="move-buttons">
                    <button class="settings-button half-width" @click=${this.handleMoveLeft}>
                        <span>← Mover</span>
                    </button>
                    <button class="settings-button half-width" @click=${this.handleMoveRight}>
                        <span>Mover →</span>
                    </button>
                </div>
                <button class="settings-button full-width" @click=${this.handlePersonalize}>
                    <span>Abrir painel web</span>
                </button>
            </div>
        `;

        const panes = {
            agentes: agentesPane,
            conta: contaPane,
            modelos: modelosPane,
            atalhos: atalhosPane,
            geral: geralPane,
        };

        return html`
            <div class="settings-container">
                <button class="close-button" title="Fechar" @click=${this.handleClose}>✕</button>

                <div class="sidebar">
                    <div class="sidebar-title">Copiloto V4</div>
                    ${tabs.map(tab => html`
                        <div class="nav-item ${this.activeTab === tab.id ? 'active' : ''}"
                             @click=${() => { this.activeTab = tab.id; }}>
                            <span class="nav-icon">${tab.icon}</span>
                            ${tab.label}
                        </div>
                    `)}
                    <div class="sidebar-footer">
                        <button class="settings-button full-width danger" @click=${this.handleQuit}>
                            <span>Sair do Copiloto</span>
                        </button>
                    </div>
                </div>

                <div class="content-area">
                    ${panes[this.activeTab] || agentesPane}
                </div>
            </div>
        `;
    }
    //////// after_modelStateService ////////
}

customElements.define('settings-view', SettingsView);