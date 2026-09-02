import { html, css, LitElement } from '../assets/lit-core-2.7.4.min.js';
import { accountStyles, isValidEmail, accountErrorMessage } from './accountStyles.js';

/**
 * Criar conta — primeiro passo da configuração.
 * Três campos e nada além: cada campo a mais aqui é gente desistindo.
 * O serviço cria a conta e já devolve a sessão, então daqui o cliente segue
 * direto para a confirmação de e-mail sem precisar entrar de novo.
 */
export class SignupHeader extends LitElement {
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
        name: { type: String, state: true },
        password: { type: String, state: true },
        isLoading: { type: Boolean, state: true },
        formError: { type: String, state: true },
        fieldErrors: { type: Object, state: true },
        createdCallback: { type: Function },
        loginCallback: { type: Function },
        backCallback: { type: Function },
    };

    constructor() {
        super();
        this.email = '';
        this.name = '';
        this.password = '';
        this.isLoading = false;
        this.formError = '';
        this.fieldErrors = {};
        this.createdCallback = () => {};
        this.loginCallback = () => {};
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
        if (!this.name.trim()) errors.name = 'Digite seu nome.';
        if ((this.password || '').length < 8) errors.password = 'A senha precisa de pelo menos 8 caracteres.';
        this.fieldErrors = errors;
        return Object.keys(errors).length === 0;
    }

    async handleSubmit() {
        if (this.isLoading) return;
        this.formError = '';
        if (!this._validate()) return;

        if (!window.api?.v4Auth?.createAccount) {
            this.formError = 'Cadastro indisponível nesta versão. Atualize o aplicativo.';
            return;
        }

        this.isLoading = true;
        try {
            const result = await window.api.v4Auth.createAccount(this.email.trim(), this.name.trim(), this.password);
            if (result && result.success === false) {
                this.formError = accountErrorMessage(result.error, 'Não foi possível criar a conta. Tente de novo.');
                return;
            }
            this.createdCallback(this.email.trim());
        } catch (error) {
            console.error('[SignupHeader] Falha ao criar conta:', error);
            this.formError = accountErrorMessage(error, 'Não foi possível criar a conta. Tente de novo.');
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
                    <div class="title">Criar conta</div>
                    <div class="lead">Leva menos de um minuto. Depois é só liberar os acessos e começar.</div>
                </div>

                ${this.formError ? html`<div class="banner error">${this.formError}</div>` : ''}

                <div class="fields" @keydown=${this._onKeyDown}>
                    <div class="field">
                        <input
                            class="input ${this.fieldErrors.email ? 'invalid' : ''}"
                            type="email"
                            autocomplete="email"
                            placeholder="E-mail de trabalho"
                            .value=${this.email}
                            ?disabled=${this.isLoading}
                            @input=${e => { this.email = e.target.value; this.fieldErrors = { ...this.fieldErrors, email: '' }; }}
                        />
                        ${this.fieldErrors.email ? html`<div class="field-error">${this.fieldErrors.email}</div>` : ''}
                    </div>

                    <div class="field">
                        <input
                            class="input ${this.fieldErrors.name ? 'invalid' : ''}"
                            type="text"
                            autocomplete="name"
                            placeholder="Seu nome"
                            .value=${this.name}
                            ?disabled=${this.isLoading}
                            @input=${e => { this.name = e.target.value; this.fieldErrors = { ...this.fieldErrors, name: '' }; }}
                        />
                        ${this.fieldErrors.name ? html`<div class="field-error">${this.fieldErrors.name}</div>` : ''}
                    </div>

                    <div class="field">
                        <input
                            class="input ${this.fieldErrors.password ? 'invalid' : ''}"
                            type="password"
                            autocomplete="new-password"
                            placeholder="Senha (mínimo 8 caracteres)"
                            .value=${this.password}
                            ?disabled=${this.isLoading}
                            @input=${e => { this.password = e.target.value; this.fieldErrors = { ...this.fieldErrors, password: '' }; }}
                        />
                        ${this.fieldErrors.password ? html`<div class="field-error">${this.fieldErrors.password}</div>` : ''}
                    </div>
                </div>

                <div class="actions">
                    <button class="button primary" ?disabled=${this.isLoading} @click=${this.handleSubmit}>
                        ${this.isLoading ? 'Criando conta...' : 'Criar conta'}
                    </button>
                    <button class="link-button" ?disabled=${this.isLoading} @click=${() => this.loginCallback()}>
                        Já tenho conta · Entrar
                    </button>
                </div>

                <div class="progress">
                    <i class="on"></i><i></i><i></i><i></i>
                </div>
            </div>
        `;
    }
}

customElements.define('signup-header', SignupHeader);
