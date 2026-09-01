import { html, css, LitElement } from '../assets/lit-core-2.7.4.min.js';

export class MainHeader extends LitElement {
    static properties = {
        isTogglingSession: { type: Boolean, state: true },
        shortcuts: { type: Object, state: true },
        listenSessionStatus: { type: String, state: true },
        presets: { type: Array, state: true },
    };

    static styles = css`
        :host {
            display: flex;
            transition: transform 0.2s cubic-bezier(0.23, 1, 0.32, 1), opacity 0.2s ease-out;
        }

        :host(.hiding) {
            animation: slideUp 0.3s cubic-bezier(0.4, 0, 0.6, 1) forwards;
        }

        :host(.showing) {
            animation: slideDown 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }

        :host(.sliding-in) {
            animation: fadeIn 0.2s ease-out forwards;
        }

        :host(.hidden) {
            opacity: 0;
            transform: translateY(-150%) scale(0.85);
            pointer-events: none;
        }


        * {
            font-family: 'Helvetica Neue', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            cursor: default;
            user-select: none;
        }

        .header {
            -webkit-app-region: drag;
            width: max-content;
            height: 47px;
            padding: 2px 10px 2px 13px;
            background: transparent;
            overflow: hidden;
            border-radius: 9000px;
            /* backdrop-filter: blur(1px); */
            justify-content: space-between;
            align-items: center;
            display: inline-flex;
            box-sizing: border-box;
            position: relative;
        }

        .header::before {
            content: '';
            position: absolute;
            top: 0; left: 0; right: 0; bottom: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.6);
            border-radius: 9000px;
            z-index: -1;
        }

        .header::after {
            content: '';
            position: absolute;
            top: 0; left: 0; right: 0; bottom: 0;
            border-radius: 9000px;
            padding: 1px;
            background: linear-gradient(169deg, rgba(255, 255, 255, 0.17) 0%, rgba(255, 255, 255, 0.08) 50%, rgba(255, 255, 255, 0.17) 100%); 
            -webkit-mask:
                linear-gradient(#fff 0 0) content-box,
                linear-gradient(#fff 0 0);
            -webkit-mask-composite: destination-out;
            mask-composite: exclude;
            pointer-events: none;
        }

        .listen-button {
            -webkit-app-region: no-drag;
            height: 26px;
            padding: 0 13px;
            background: transparent;
            border-radius: 9000px;
            justify-content: center;
            width: 78px;
            align-items: center;
            gap: 6px;
            display: flex;
            border: none;
            cursor: pointer;
            position: relative;
        }

        .listen-button:disabled {
            cursor: default;
            opacity: 0.8;
        }

        /* Afastada da ponta arredondada da cápsula para nunca ser recortada */
        .v4-mark {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 24px;
            height: 24px;
            margin-left: 10px;
            margin-right: 8px;
            flex-shrink: 0;
        }

        .v4-mark img {
            width: 24px;
            height: 24px;
            display: block;
            border-radius: 5px;
        }

        .listen-button.done {
            background-color: rgba(255, 255, 255, 0.6);
            transition: background-color 0.15s ease;
        }

        .listen-button.done .action-text-content {
            color: black;
        }
        
        .listen-button.done .listen-icon svg rect,
        .listen-button.done .listen-icon svg path {
            fill: black;
        }

        .listen-button.done:hover {
            background-color: #f0f0f0;
        }

        .listen-button:hover::before {
            background: rgba(255, 255, 255, 0.18);
        }

        .listen-button::before {
            content: '';
            position: absolute;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(255, 255, 255, 0.14);
            border-radius: 9000px;
            z-index: -1;
            transition: background 0.15s ease;
        }

        .listen-button::after {
            content: '';
            position: absolute;
            top: 0; left: 0; right: 0; bottom: 0;
            border-radius: 9000px;
            padding: 1px;
            background: linear-gradient(169deg, rgba(255, 255, 255, 0.17) 0%, rgba(255, 255, 255, 0.08) 50%, rgba(255, 255, 255, 0.17) 100%);
            -webkit-mask:
                linear-gradient(#fff 0 0) content-box,
                linear-gradient(#fff 0 0);
            -webkit-mask-composite: destination-out;
            mask-composite: exclude;
            pointer-events: none;
        }

        .listen-button.done::after {
            display: none;
        }

        .loading-dots {
            display: flex;
            align-items: center;
            gap: 5px;
        }

        .loading-dots span {
            width: 6px;
            height: 6px;
            background-color: white;
            border-radius: 50%;
            animation: pulse 1.4s infinite ease-in-out both;
        }
        .loading-dots span:nth-of-type(1) {
            animation-delay: -0.32s;
        }
        .loading-dots span:nth-of-type(2) {
            animation-delay: -0.16s;
        }
        @keyframes pulse {
            0%, 80%, 100% {
                opacity: 0.2;
            }
            40% {
                opacity: 1.0;
            }
        }

        .header-actions {
            -webkit-app-region: no-drag;
            height: 26px;
            box-sizing: border-box;
            justify-content: flex-start;
            align-items: center;
            gap: 9px;
            display: flex;
            padding: 0 8px;
            border-radius: 6px;
            transition: background 0.15s ease;
        }

        .header-actions:hover {
            background: rgba(255, 255, 255, 0.1);
        }

        .ask-action {
            margin-left: 4px;
        }

        .action-button,
        .action-text {
            padding-bottom: 1px;
            justify-content: center;
            align-items: center;
            gap: 10px;
            display: flex;
        }

        .action-text-content {
            color: white;
            font-size: 12px;
            font-family: 'Helvetica Neue', sans-serif;
            font-weight: 500; /* Medium */
            word-wrap: break-word;
        }

        .icon-container {
            justify-content: flex-start;
            align-items: center;
            gap: 4px;
            display: flex;
        }

        .icon-container.ask-icons svg,
        .icon-container.showhide-icons svg {
            width: 12px;
            height: 12px;
        }

        .listen-icon svg {
            width: 12px;
            height: 11px;
            position: relative;
            top: 1px;
        }

        .icon-box {
            color: white;
            font-size: 12px;
            font-family: 'Helvetica Neue', sans-serif;
            font-weight: 500;
            background-color: rgba(255, 255, 255, 0.1);
            border-radius: 13%;
            width: 18px;
            height: 18px;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .agent-select {
            -webkit-app-region: no-drag;
            height: 26px;
            max-width: 148px;
            min-width: 96px;
            margin-left: 4px;
            padding: 0 22px 0 10px;
            background-color: rgba(255, 255, 255, 0.14);
            color: white;
            font-size: 12px;
            font-weight: 500;
            font-family: 'Helvetica Neue', sans-serif;
            border: none;
            border-radius: 9000px;
            outline: none;
            cursor: pointer;
            appearance: none;
            -webkit-appearance: none;
            text-overflow: ellipsis;
            white-space: nowrap;
            overflow: hidden;
            background-image: url("data:image/svg+xml;utf8,<svg fill='white' height='12' viewBox='0 0 24 24' width='12' xmlns='http://www.w3.org/2000/svg'><path d='M7 10l5 5 5-5z'/></svg>");
            background-repeat: no-repeat;
            background-position: right 7px center;
            transition: background-color 0.15s ease;
        }

        .agent-select:hover {
            background-color: rgba(255, 255, 255, 0.22);
        }

        .agent-select option {
            background: #222;
            color: white;
        }

        .settings-button {
            -webkit-app-region: no-drag;
            padding: 5px;
            border-radius: 50%;
            background: transparent;
            transition: background 0.15s ease;
            color: white;
            border: none;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .settings-button:hover {
            background: rgba(255, 255, 255, 0.1);
        }

        .settings-icon {
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 3px;
        }

        .settings-icon svg {
            width: 16px;
            height: 16px;
        }
        /* ────────────────[ GLASS BYPASS ]─────────────── */
        :host-context(body.has-glass) .header,
        :host-context(body.has-glass) .listen-button,
        :host-context(body.has-glass) .header-actions,
        :host-context(body.has-glass) .agent-select,
        :host-context(body.has-glass) .settings-button {
            background: transparent !important;
            filter: none !important;
            box-shadow: none !important;
            backdrop-filter: none !important;
        }
        :host-context(body.has-glass) .icon-box {
            background: transparent !important;
            border: none !important;
        }

        :host-context(body.has-glass) .header::before,
        :host-context(body.has-glass) .header::after,
        :host-context(body.has-glass) .listen-button::before,
        :host-context(body.has-glass) .listen-button::after {
            display: none !important;
        }

        :host-context(body.has-glass) .header-actions:hover,
        :host-context(body.has-glass) .settings-button:hover,
        :host-context(body.has-glass) .listen-button:hover::before {
            background: transparent !important;
        }
        :host-context(body.has-glass) * {
            animation: none !important;
            transition: none !important;
            transform: none !important;
            filter: none !important;
            backdrop-filter: none !important;
            box-shadow: none !important;
        }

        :host-context(body.has-glass) .header,
        :host-context(body.has-glass) .listen-button,
        :host-context(body.has-glass) .header-actions,
        :host-context(body.has-glass) .agent-select,
        :host-context(body.has-glass) .settings-button,
        :host-context(body.has-glass) .icon-box {
            border-radius: 0 !important;
        }
        :host-context(body.has-glass) {
            animation: none !important;
            transition: none !important;
            transform: none !important;
            will-change: auto !important;
        }
        `;

    constructor() {
        super();
        this.shortcuts = {};
        this.presets = [];
        this.isVisible = true;
        this.isAnimating = false;
        this.hasSlidIn = false;
        this.settingsHideTimer = null;
        this.isTogglingSession = false;
        this.listenSessionStatus = 'beforeSession';
        this.animationEndTimer = null;
        this.handleAnimationEnd = this.handleAnimationEnd.bind(this);
        this.handleMouseMove = this.handleMouseMove.bind(this);
        this.handleMouseUp = this.handleMouseUp.bind(this);
        this.dragState = null;
        this.wasJustDragged = false;
    }

    // Ação interna (o listenService e as classes CSS dependem destes valores)
    _getListenButtonText(status) {
        switch (status) {
            case 'beforeSession': return 'Listen';
            case 'inSession'   : return 'Stop';
            case 'afterSession': return 'Done';
            default            : return 'Listen';
        }
    }

    // Rótulo exibido ao closer (PT-BR) — nunca usado como ação
    _getListenButtonLabel(status) {
        switch (status) {
            case 'beforeSession': return 'Ouvir';
            case 'inSession'   : return 'Parar';
            case 'afterSession': return 'Fim';
            default            : return 'Ouvir';
        }
    }

    async handleMouseDown(e) {
        e.preventDefault();

        // O estado e os listeners precisam existir ANTES do await: se o botão for
        // solto enquanto a posição da janela não chegou, o mouseup tem que ser ouvido.
        const dragState = {
            initialMouseX: e.screenX,
            initialMouseY: e.screenY,
            initialWindowX: null,
            initialWindowY: null,
            moved: false,
        };
        this.dragState = dragState;

        window.addEventListener('mousemove', this.handleMouseMove, { capture: true });
        window.addEventListener('mouseup', this.handleMouseUp, { capture: true });

        const initialPosition = await window.api.mainHeader.getHeaderPosition();

        // O arrasto já terminou (ou outro começou) enquanto esperávamos.
        if (this.dragState !== dragState) return;

        dragState.initialWindowX = initialPosition.x;
        dragState.initialWindowY = initialPosition.y;
    }

    handleMouseMove(e) {
        if (!this.dragState) return;

        // Nenhum botão pressionado: o mouseup se perdeu (solto fora da janela).
        // Sem isso a janela ficaria grudada no cursor para sempre.
        if (e.buttons === 0) {
            this.handleMouseUp(e);
            return;
        }

        // A posição inicial da janela ainda não chegou do processo principal.
        if (this.dragState.initialWindowX === null) return;

        const deltaX = Math.abs(e.screenX - this.dragState.initialMouseX);
        const deltaY = Math.abs(e.screenY - this.dragState.initialMouseY);
        
        if (deltaX > 3 || deltaY > 3) {
            this.dragState.moved = true;
        }

        const newWindowX = this.dragState.initialWindowX + (e.screenX - this.dragState.initialMouseX);
        const newWindowY = this.dragState.initialWindowY + (e.screenY - this.dragState.initialMouseY);

        window.api.mainHeader.moveHeaderTo(newWindowX, newWindowY);
    }

    handleMouseUp(e) {
        if (!this.dragState) return;

        const wasDragged = this.dragState.moved;

        window.removeEventListener('mousemove', this.handleMouseMove, { capture: true });
        window.removeEventListener('mouseup', this.handleMouseUp, { capture: true });
        this.dragState = null;

        if (wasDragged) {
            this.wasJustDragged = true;
            setTimeout(() => {
                this.wasJustDragged = false;
            }, 0);
        }
    }

    toggleVisibility() {
        if (this.isAnimating) {
            console.log('[MainHeader] Animation already in progress, ignoring toggle');
            return;
        }
        
        if (this.animationEndTimer) {
            clearTimeout(this.animationEndTimer);
            this.animationEndTimer = null;
        }
        
        this.isAnimating = true;
        
        if (this.isVisible) {
            this.hide();
        } else {
            this.show();
        }
    }

    hide() {
        this.classList.remove('showing');
        this.classList.add('hiding');
    }
    
    show() {
        this.classList.remove('hiding', 'hidden');
        this.classList.add('showing');
    }
    
    handleAnimationEnd(e) {
        if (e.target !== this) return;
    
        this.isAnimating = false;
    
        if (this.classList.contains('hiding')) {
            this.classList.add('hidden');
            if (window.api) {
                window.api.mainHeader.sendHeaderAnimationFinished('hidden');
            }
        } else if (this.classList.contains('showing')) {
            if (window.api) {
                window.api.mainHeader.sendHeaderAnimationFinished('visible');
            }
        }
    }

    startSlideInAnimation() {
        if (this.hasSlidIn) return;
        this.classList.add('sliding-in');
    }

    connectedCallback() {
        super.connectedCallback();
        this.addEventListener('animationend', this.handleAnimationEnd);

        if (window.api) {

            this._sessionStateTextListener = (event, { success }) => {
                if (success) {
                    this.listenSessionStatus = ({
                        beforeSession: 'inSession',
                        inSession: 'afterSession',
                        afterSession: 'beforeSession',
                    })[this.listenSessionStatus] || 'beforeSession';
                } else {
                    this.listenSessionStatus = 'beforeSession';
                }
                this.isTogglingSession = false; // ✨ 로딩 상태만 해제
            };
            window.api.mainHeader.onListenChangeSessionResult(this._sessionStateTextListener);

            this._shortcutListener = (event, keybinds) => {
                console.log('[MainHeader] Received updated shortcuts:', keybinds);
                this.shortcuts = keybinds;
            };
            window.api.mainHeader.onShortcutsUpdated(this._shortcutListener);

            this._presetsUpdatedListener = () => this._loadPresets();
            window.api.mainHeader.onPresetsUpdated(this._presetsUpdatedListener);
            this._loadPresets();
        }
    }

    async _loadPresets() {
        try {
            const presets = await window.api.mainHeader.getPresets();
            this.presets = presets || [];
        } catch (error) {
            console.error('[MainHeader] Failed to load agents:', error);
        }
    }

    updated(changedProperties) {
        super.updated?.(changedProperties);
        // <select> não re-seleciona via atributo depois do primeiro render; sincroniza o valor.
        const sel = this.renderRoot?.querySelector('.agent-select');
        if (sel) {
            const active = this.presets.find(p => p.is_active === 1);
            sel.value = active ? active.id : '';
        }
    }

    async _handleAgentChange(e) {
        const id = e.target.value || null;
        try {
            await window.api.mainHeader.setActivePreset(id);
            this.presets = this.presets.map(p => ({ ...p, is_active: p.id === id ? 1 : 0 }));
        } catch (error) {
            console.error('[MainHeader] Failed to set active agent:', error);
        }
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this.removeEventListener('animationend', this.handleAnimationEnd);
        
        if (this.animationEndTimer) {
            clearTimeout(this.animationEndTimer);
            this.animationEndTimer = null;
        }
        
        if (window.api) {
            if (this._sessionStateTextListener) {
                window.api.mainHeader.removeOnListenChangeSessionResult(this._sessionStateTextListener);
            }
            if (this._shortcutListener) {
                window.api.mainHeader.removeOnShortcutsUpdated(this._shortcutListener);
            }
            if (this._presetsUpdatedListener) {
                window.api.mainHeader.removeOnPresetsUpdated(this._presetsUpdatedListener);
            }
        }
    }

    toggleSettingsWindow() {
        if (this.wasJustDragged) return;
        if (window.api) {
            console.log(`[MainHeader] toggleSettingsWindow called at ${Date.now()}`);
            window.api.mainHeader.toggleSettingsWindow();
        }
    }

    async _handleListenClick() {
        if (this.wasJustDragged) return;
        if (this.isTogglingSession) {
            return;
        }

        this.isTogglingSession = true;

        try {
            const listenButtonText = this._getListenButtonText(this.listenSessionStatus);
            if (window.api) {
                await window.api.mainHeader.sendListenButtonClick(listenButtonText);
            }
        } catch (error) {
            console.error('IPC invoke for session change failed:', error);
            this.isTogglingSession = false;
        }
    }

    async _handleAskClick() {
        if (this.wasJustDragged) return;

        try {
            if (window.api) {
                await window.api.mainHeader.sendAskButtonClick();
            }
        } catch (error) {
            console.error('IPC invoke for ask button failed:', error);
        }
    }

    async _handleToggleAllWindowsVisibility() {
        if (this.wasJustDragged) return;

        try {
            if (window.api) {
                await window.api.mainHeader.sendToggleAllWindowsVisibility();
            }
        } catch (error) {
            console.error('IPC invoke for all windows visibility button failed:', error);
        }
    }


    renderShortcut(accelerator) {
        if (!accelerator) return html``;

        const keyMap = {
            'Cmd': '⌘', 'Command': '⌘',
            'Ctrl': '⌃', 'Control': '⌃',
            'Alt': '⌥', 'Option': '⌥',
            'Shift': '⇧',
            'Enter': '↵',
            'Backspace': '⌫',
            'Delete': '⌦',
            'Tab': '⇥',
            'Escape': '⎋',
            'Up': '↑', 'Down': '↓', 'Left': '←', 'Right': '→',
            '\\': html`<svg viewBox="0 0 6 12" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:6px; height:12px;"><path d="M1.5 1.3L5.1 10.6" stroke="white" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
        };

        const keys = accelerator.split('+');
        return html`${keys.map(key => html`
            <div class="icon-box">${keyMap[key] || key}</div>
        `)}`;
    }

    render() {
        const listenButtonText = this._getListenButtonText(this.listenSessionStatus);
    
        const buttonClasses = {
            active: listenButtonText === 'Stop',
            done: listenButtonText === 'Done',
        };
        const showStopIcon = listenButtonText === 'Stop' || listenButtonText === 'Done';

        return html`
            <div class="header" @mousedown=${this.handleMouseDown}>
                <div class="v4-mark" title="V4 Company"><img src="data:image/png;base64,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" alt="V4 Company" /></div>
                                <button
                    class="listen-button ${Object.keys(buttonClasses).filter(k => buttonClasses[k]).join(' ')}"
                    @click=${this._handleListenClick}
                    ?disabled=${this.isTogglingSession}
                >
                    ${this.isTogglingSession
                        ? html`
                            <div class="loading-dots">
                                <span></span><span></span><span></span>
                            </div>
                        `
                        : html`
                            <div class="action-text">
                                <div class="action-text-content">${this._getListenButtonLabel(this.listenSessionStatus)}</div>
                            </div>
                            <div class="listen-icon">
                                ${showStopIcon
                                    ? html`
                                        <svg width="9" height="9" viewBox="0 0 9 9" fill="none" xmlns="http://www.w3.org/2000/svg">
                                            <rect width="9" height="9" rx="1" fill="white"/>
                                        </svg>
                                    `
                                    : html`
                                        <svg width="12" height="11" viewBox="0 0 12 11" fill="none" xmlns="http://www.w3.org/2000/svg">
                                            <path d="M1.69922 2.7515C1.69922 2.37153 2.00725 2.0635 2.38722 2.0635H2.73122C3.11119 2.0635 3.41922 2.37153 3.41922 2.7515V8.2555C3.41922 8.63547 3.11119 8.9435 2.73122 8.9435H2.38722C2.00725 8.9435 1.69922 8.63547 1.69922 8.2555V2.7515Z" fill="white"/>
                                            <path d="M5.13922 1.3755C5.13922 0.995528 5.44725 0.6875 5.82722 0.6875H6.17122C6.55119 0.6875 6.85922 0.995528 6.85922 1.3755V9.6315C6.85922 10.0115 6.55119 10.3195 6.17122 10.3195H5.82722C5.44725 10.3195 5.13922 10.0115 5.13922 9.6315V1.3755Z" fill="white"/>
                                            <path d="M8.57922 3.0955C8.57922 2.71553 8.88725 2.4075 9.26722 2.4075H9.61122C9.99119 2.4075 10.2992 2.71553 10.2992 3.0955V7.9115C10.2992 8.29147 9.99119 8.5995 9.61122 8.5995H9.26722C8.88725 8.5995 8.57922 8.29147 8.57922 7.9115V3.0955Z" fill="white"/>
                                        </svg>
                                    `}
                            </div>
                        `}
                </button>

                <div class="header-actions ask-action" @click=${() => this._handleAskClick()}>
                    <div class="action-text">
                        <div class="action-text-content">Perguntar</div>
                    </div>
                    <div class="icon-container">
                        ${this.renderShortcut(this.shortcuts.nextStep)}
                    </div>
                </div>

                <div class="header-actions" @click=${() => this._handleToggleAllWindowsVisibility()}>
                    <div class="action-text">
                        <div class="action-text-content">Exibir/Ocultar</div>
                    </div>
                    <div class="icon-container">
                        ${this.renderShortcut(this.shortcuts.toggleVisibility)}
                    </div>
                </div>

                <select
                    class="agent-select"
                    title="Agente ativo"
                    @mousedown=${(e) => e.stopPropagation()}
                    @change=${(e) => this._handleAgentChange(e)}
                >
                    <option value="" ?selected=${!this.presets.some(p => p.is_active === 1)}>Agente: padrão</option>
                    ${this.presets.map(p => html`
                        <option value=${p.id} ?selected=${p.is_active === 1}>${p.title}</option>
                    `)}
                </select>

                <button
                    class="settings-button"
                    title="Configurações"
                    @click=${() => this.toggleSettingsWindow()}
                >
                    <div class="settings-icon">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
                            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
                            <circle cx="12" cy="12" r="3"/>
                        </svg>
                    </div>
                </button>
            </div>
        `;
    }
}

customElements.define('main-header', MainHeader);
