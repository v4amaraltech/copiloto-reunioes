import { html, css, LitElement } from '../assets/lit-core-2.7.4.min.js';
import { accountStyles, accountErrorMessage } from './accountStyles.js';

/**
 * Confirmar e-mail — não trava o fluxo.
 * O cliente confirma quando quiser e segue configurando; travar aqui é perder
 * quem fechou o app para abrir o e-mail e não voltou. A confirmação vira
 * exigência só onde protege algo (recuperar senha, plano pago).
 */
export class VerifyEmailHeader extends LitElement {
    static styles = [
        accountStyles,
        css`
            .email {
                color: white;
                font-weight: 600;
                word-break: break-all;
            }
        `,
    ];

    static properties = {
        email: { type: String },
        isSending: { type: Boolean, state: true },
        formError: { type: String, state: true },
        sentMessage: { type: String, state: true },
        continueCallback: { type: Function },
    };

    constructor() {
        super();
        this.email = '';
        this.isSending = false;
        this.formError = '';
        this.sentMessage = '';
        this.continueCallback = () => {};
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

    async handleResend() {
        if (this.isSending) return;
        this.formError = '';
        this.sentMessage = '';

        if (!window.api?.v4Auth?.sendVerification) {
            this.formError = 'Reenvio indisponível nesta versão. Atualize o aplicativo.';
            return;
        }

        this.isSending = true;
        try {
            const result = await window.api.v4Auth.sendVerification();
            if (result && result.success === false) {
                this.formError = accountErrorMessage(result.error, 'Não foi possível reenviar agora. Tente em instantes.');
                return;
            }
            this.sentMessage = 'E-mail reenviado. Confira também a caixa de spam.';
        } catch (error) {
            console.error('[VerifyEmailHeader] Falha ao reenviar verificação:', error);
            this.formError = accountErrorMessage(error, 'Não foi possível reenviar agora. Tente em instantes.');
        } finally {
            this.isSending = false;
        }
    }

    render() {
        return html`
            <div class="container">
                <button class="close-button" @click=${this.handleClose} title="Fechar">×</button>

                <div class="head">
                    <div class="title">Confirme seu e-mail</div>
                    <div class="lead">
                        Enviamos um link para <span class="email">${this.email || 'seu e-mail'}</span>.
                        Abra o link para confirmar — você pode continuar configurando enquanto isso.
                    </div>
                </div>

                ${this.formError ? html`<div class="banner error">${this.formError}</div>` : ''}
                ${this.sentMessage ? html`<div class="banner ok">${this.sentMessage}</div>` : ''}

                <div class="actions">
                    <button class="button primary" @click=${() => this.continueCallback()}>
                        Continuar configuração
                    </button>
                    <button class="link-button" ?disabled=${this.isSending} @click=${this.handleResend}>
                        ${this.isSending ? 'Reenviando...' : 'Reenviar e-mail'}
                    </button>
                </div>

                <div class="progress">
                    <i class="on"></i><i class="on"></i><i></i><i></i>
                </div>
            </div>
        `;
    }
}

customElements.define('verify-email-header', VerifyEmailHeader);
