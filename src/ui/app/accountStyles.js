import { css } from '../assets/lit-core-2.7.4.min.js';

/**
 * Estilos compartilhados pelas telas da jornada de conta (criar conta, confirmar
 * e-mail, entrar). Mantêm o visual das telas que já existiam no header — fundo
 * escuro translúcido, contorno branco por dentro e o vermelho da V4 — para a
 * jornada não parecer feita de dois produtos diferentes.
 *
 * A janela tem 520px de largura: cada tela pede uma coisa só e explica em uma linha.
 */
export const accountStyles = css`
    :host {
        display: block;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }

    * {
        box-sizing: border-box;
    }

    .container {
        width: 100%;
        padding: 22px 24px 18px 24px;
        background: rgba(0, 0, 0, 0.64);
        box-shadow: 0px 0px 0px 1.5px rgba(255, 255, 255, 0.64) inset;
        border-radius: 16px;
        display: flex;
        flex-direction: column;
        gap: 14px;
        color: white;
        position: relative;
        -webkit-app-region: drag;
    }

    .close-button {
        -webkit-app-region: no-drag;
        position: absolute;
        top: 14px;
        right: 14px;
        width: 20px;
        height: 20px;
        background: rgba(255, 255, 255, 0.1);
        border: none;
        border-radius: 5px;
        color: rgba(255, 255, 255, 0.7);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 15px;
        line-height: 1;
        padding: 0;
        transition: all 0.15s ease;
    }

    .close-button:hover {
        background: rgba(255, 255, 255, 0.2);
        color: rgba(255, 255, 255, 0.95);
    }

    .head {
        display: flex;
        flex-direction: column;
        gap: 5px;
        padding-right: 28px;
    }

    .title {
        font-size: 17px;
        font-weight: 700;
        letter-spacing: -0.2px;
    }

    .lead {
        font-size: 12.5px;
        font-weight: 400;
        line-height: 1.45;
        color: rgba(255, 255, 255, 0.66);
    }

    .back-button {
        -webkit-app-region: no-drag;
        align-self: flex-start;
        display: flex;
        align-items: center;
        gap: 5px;
        background: none;
        border: none;
        color: rgba(255, 255, 255, 0.6);
        font-size: 11.5px;
        font-family: inherit;
        padding: 0;
        cursor: pointer;
    }

    .back-button:hover {
        color: white;
    }

    /* ── Campos ── */
    .fields {
        display: flex;
        flex-direction: column;
        gap: 9px;
    }

    .field {
        display: flex;
        flex-direction: column;
        gap: 4px;
    }

    .input {
        -webkit-app-region: no-drag;
        width: 100%;
        background: rgba(0, 0, 0, 0.32);
        border: 1px solid rgba(255, 255, 255, 0.18);
        border-radius: 9px;
        color: white;
        font-size: 13px;
        font-family: inherit;
        padding: 10px 12px;
        outline: none;
        cursor: text;
        user-select: text;
        transition: border-color 0.15s ease;
    }

    .input::placeholder {
        color: rgba(255, 255, 255, 0.38);
    }

    .input:focus {
        border-color: rgba(238, 27, 46, 0.8);
    }

    .input.invalid {
        border-color: rgba(255, 90, 90, 0.85);
    }

    .input:disabled {
        opacity: 0.55;
    }

    .field-error {
        font-size: 11px;
        line-height: 1.35;
        color: #ff9d9d;
        padding-left: 2px;
    }

    /* ── Botões ── */
    .actions {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .button {
        -webkit-app-region: no-drag;
        width: 100%;
        border-radius: 10px;
        border: 1px solid transparent;
        font-family: inherit;
        font-size: 12.5px;
        font-weight: 600;
        padding: 11px 12px;
        cursor: pointer;
        color: white;
        transition: background 0.15s ease, border-color 0.15s ease;
    }

    .button.primary {
        background: rgba(238, 27, 46, 0.9);
        border-color: rgba(255, 255, 255, 0.35);
    }

    .button.primary:hover {
        background: rgba(238, 27, 46, 1);
    }

    .button.ghost {
        background: rgba(255, 255, 255, 0.08);
        border-color: rgba(255, 255, 255, 0.18);
    }

    .button.ghost:hover {
        background: rgba(255, 255, 255, 0.16);
    }

    .button:disabled {
        opacity: 0.45;
        cursor: default;
    }

    .link-button {
        -webkit-app-region: no-drag;
        background: none;
        border: none;
        color: rgba(255, 255, 255, 0.6);
        font-family: inherit;
        font-size: 11.5px;
        padding: 3px;
        cursor: pointer;
        text-align: center;
    }

    .link-button:hover {
        color: white;
        text-decoration: underline;
    }

    .link-button:disabled {
        opacity: 0.45;
        cursor: default;
        text-decoration: none;
    }

    /* ── Avisos ── */
    .banner {
        font-size: 11.5px;
        line-height: 1.4;
        padding: 9px 11px;
        border-radius: 9px;
    }

    .banner.error {
        background: rgba(238, 27, 46, 0.18);
        color: #ff9d9d;
    }

    .banner.ok {
        background: rgba(80, 180, 120, 0.16);
        color: #9fe0bd;
    }

    /* ── Barra de progresso da configuração ── */
    .progress {
        display: flex;
        gap: 4px;
        padding-top: 2px;
    }

    .progress i {
        height: 2px;
        flex: 1;
        background: rgba(255, 255, 255, 0.16);
        border-radius: 1px;
    }

    .progress i.on {
        background: rgba(238, 27, 46, 0.95);
    }
`;

/** Validação de e-mail suficiente para pegar erro de digitação antes de bater no servidor. */
export function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((value || '').trim());
}

/**
 * Mensagem em português para o que vier do serviço. O Forja pode devolver texto já
 * traduzido (usado como está) ou um código do Appwrite (traduzido aqui).
 */
export function accountErrorMessage(error, fallback) {
    const raw = typeof error === 'string' ? error : error?.message || error?.type || '';
    const code = String(raw);

    const byCode = {
        user_already_exists: 'Já existe uma conta com este e-mail. Tente entrar.',
        user_email_already_exists: 'Já existe uma conta com este e-mail. Tente entrar.',
        user_invalid_credentials: 'E-mail ou senha incorretos.',
        user_password_mismatch: 'E-mail ou senha incorretos.',
        password_recently_used: 'Escolha uma senha diferente das anteriores.',
        general_argument_invalid: 'Confira os dados preenchidos.',
        general_rate_limit_exceeded: 'Muitas tentativas. Espere um minuto e tente de novo.',
        user_not_found: 'Não encontramos uma conta com este e-mail.',
    };

    if (byCode[code]) return byCode[code];
    // Texto já em português vindo do serviço: mostra como está.
    if (code && /\s/.test(code)) return code;
    return fallback;
}
