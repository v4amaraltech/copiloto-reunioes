import { html, css, LitElement } from '../assets/lit-core-2.7.4.min.js';
import { accountStyles, isValidEmail, accountErrorMessage } from './accountStyles.js';

/**
 * Entrar — o login por e-mail e senha já existia, mas só dentro das
 * configurações, onde o cliente novo não chega. Aqui ele existe na entrada.
 *
 * O link "Esqueci minha senha" dispara `recoveryCallback`: a tela de nova senha
 * vem na próxima rodada, quando o destino do link do e-mail estiver definido.
 */
export class LoginHeader extends LitElement {
    static styles = [
        accountStyles,
        css`
            .container {
                gap: 12px;
            }
        `,
    ];

    static properties = {
        email: { type: String, state: true },
        password: { type: String, state: true },
        isLoading: { type: Boolean, state: true },
        formError: { type: String, state: true },
        noticeMessage: { type: String, state: true },
        fieldErrors: { type: Object, state: true },
        loggedInCallback: { type: Function },
        signupCallback: { type: Function },
        recoveryCallback: { type: Function },
        backCallback: { type: Function },
    };

    constructor() {
        super();
        this.email = '';
        this.password = '';
        this.isLoading = false;
        this.formError = '';
        this.noticeMessage = '';
        this.fieldErrors = {};
        this.loggedInCallback = () => {};
        this.signupCallback = () => {};
        this.recoveryCallback = () => {};
        this.backCallback = () => {};
    }

    updated(changedProperties) {
        super.updated(changedProperties);
        this._requestResize();
    }

    _requestResize() {
        const container = this.shadowRoot?.querySelector('.container');
        if (!container) return;
        const height = Math.ceil(container.getBoundingClientRect().height);
        if (height > 0 && height !== this._lastHeight) {
            this._lastHeight = height;
            this.dispatchEvent(new CustomEvent('request-resize', { detail: { height }, bubbles: true, composed: true }));
        }
    }

    handleClose() {
        window.api?.common?.quitApplication();
    }

    _validate() {
        const errors = {};
        if (!isValidEmail(this.email)) errors.email = 'Digite um e-mail válido.';
        if (!this.password) errors.password = 'Digite sua senha.';
        this.fieldErrors = errors;
        return Object.keys(errors).length === 0;
    }

    async handleSubmit() {
        if (this.isLoading) return;
        this.formError = '';
        this.noticeMessage = '';
        if (!this._validate()) return;

        const login = window.api?.v4Auth?.login || window.api?.settingsView?.v4Login;
        if (!login) {
            this.formError = 'Login indisponível nesta versão. Atualize o aplicativo.';
            return;
        }

        this.isLoading = true;
        try {
            const result = await login(this.email.trim(), this.password);
            if (result && result.success === false) {
                this.formError = accountErrorMessage(result.error, 'E-mail ou senha incorretos.');
                return;
            }
            this.loggedInCallback();
        } catch (error) {
            console.error('[LoginHeader] Falha no login:', error);
            this.formError = accountErrorMessage(error, 'Não foi possível entrar. Tente de novo.');
        } finally {
            this.isLoading = false;
        }
    }

    _onKeyDown(e) {
        if (e.key === 'Enter') this.handleSubmit();
    }

    render() {
        return html`
            <div class="container">
                <button class="close-button" @click=${this.handleClose} title="Fechar">×</button>

                <button class="back-button" @click=${() => this.backCallback()}>‹ Voltar</button>

                <div class="head">
                    <div class="title">Entrar</div>
                    <div class="lead">Use o e-mail e a senha da sua conta do Copiloto.</div>
                </div>

                ${this.formError ? html`<div class="banner error">${this.formError}</div>` : ''}
                ${this.noticeMessage ? html`<div class="banner ok">${this.noticeMessage}</div>` : ''}

                <div class="fields" @keydown=${this._onKeyDown}>
                    <div class="field">
                        <input
                            class="input ${this.fieldErrors.email ? 'invalid' : ''}"
                            type="email"
                            autocomplete="email"
                            placeholder="E-mail"
                            .value=${this.email}
                            ?disabled=${this.isLoading}
                            @input=${e => { this.email = e.target.value; this.fieldErrors = { ...this.fieldErrors, email: '' }; }}
                        />
                        ${this.fieldErrors.email ? html`<div class="field-error">${this.fieldErrors.email}</div>` : ''}
                    </div>

                    <div class="field">
                        <input
                            class="input ${this.fieldErrors.password ? 'invalid' : ''}"
                            type="password"
                            autocomplete="current-password"
                            placeholder="Senha"
                            .value=${this.password}
                            ?disabled=${this.isLoading}
                            @input=${e => { this.password = e.target.value; this.fieldErrors = { ...this.fieldErrors, password: '' }; }}
                        />
                        ${this.fieldErrors.password ? html`<div class="field-error">${this.fieldErrors.password}</div>` : ''}
                    </div>
                </div>

                <div class="actions">
                    <button class="button primary" ?disabled=${this.isLoading} @click=${this.handleSubmit}>
                        ${this.isLoading ? 'Entrando...' : 'Entrar'}
                    </button>
                    <button class="link-button" ?disabled=${this.isLoading} @click=${() => this.recoveryCallback(this.email.trim())}>
                        Esqueci minha senha
                    </button>
                    <button class="link-button" ?disabled=${this.isLoading} @click=${() => this.signupCallback()}>
                        Ainda não tenho conta · Criar
                    </button>
                </div>
            </div>
        `;
    }
}

customElements.define('login-header', LoginHeader);
