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

        /* ── Ações visíveis em cada agente da lista ── */
        .preset-actions {
            display: flex;
            align-items: center;
            gap: 6px;
            flex-shrink: 0;
            margin-left: 4px;
        }

        .preset-action {
            display: flex;
            align-items: center;
            gap: 5px;
            background: rgba(255, 255, 255, 0.09);
            border: 1px solid rgba(255, 255, 255, 0.14);
            border-radius: 8px;
            color: rgba(255, 255, 255, 0.88);
            font-size: 11.5px;
            font-weight: 500;
            padding: 5px 10px;
            cursor: pointer;
            white-space: nowrap;
            transition: all 0.15s ease;
        }

        .preset-action:hover {
            background: rgba(255, 255, 255, 0.17);
            border-color: rgba(255, 255, 255, 0.28);
        }

        .preset-action.danger:hover {
            background: rgba(238, 27, 46, 0.32);
            border-color: rgba(238, 27, 46, 0.7);
        }

        .preset-action svg {
            width: 13px;
            height: 13px;
            flex-shrink: 0;
        }

        .preset-item.confirming {
            background: rgba(238, 27, 46, 0.12);
            border-color: rgba(238, 27, 46, 0.55);
            cursor: default;
        }

        .confirm-text {
            flex: 1;
            font-size: 12.5px;
            color: rgba(255, 255, 255, 0.9);
        }

        /* ── Editor de agente (mesma janela, no lugar da lista) ── */
        .agent-editor {
            display: flex;
            flex-direction: column;
            gap: 10px;
            flex: 1;
            min-height: 0;
        }

        .agent-editor-head {
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .agent-back {
            display: flex;
            align-items: center;
            gap: 6px;
            background: rgba(255, 255, 255, 0.07);
            border: 1px solid rgba(255, 255, 255, 0.14);
            border-radius: 9px;
            color: white;
            font-size: 12px;
            font-weight: 500;
            padding: 6px 11px;
            cursor: pointer;
            transition: all 0.15s ease;
        }

        .agent-back:hover {
            background: rgba(255, 255, 255, 0.15);
        }

        .agent-field {
            display: flex;
            flex-direction: column;
            gap: 5px;
        }

        .agent-field.grow {
            flex: 1;
            min-height: 160px;
        }

        .agent-field-label {
            font-size: 11.5px;
            color: rgba(255, 255, 255, 0.6);
            margin-left: 2px;
        }

        .agent-input,
        .agent-textarea {
            width: 100%;
            box-sizing: border-box;
            background: rgba(0, 0, 0, 0.28);
            border: 1px solid rgba(255, 255, 255, 0.16);
            border-radius: 10px;
            color: white;
            font-size: 13px;
            padding: 9px 11px;
            outline: none;
            font-family: inherit;
            cursor: text;
            user-select: text;
        }

        .agent-textarea {
            flex: 1;
            min-height: 150px;
            line-height: 1.5;
            resize: none;
        }

        .agent-input:focus,
        .agent-textarea:focus {
            border-color: rgba(238, 27, 46, 0.75);
        }

        .agent-input:disabled,
        .agent-textarea:disabled {
            opacity: 0.55;
        }

        .agent-editor-footer {
            display: flex;
            align-items: center;
            gap: 8px;
            padding-top: 4px;
        }

        .agent-counter {
            flex: 1;
            font-size: 11px;
            color: rgba(255, 255, 255, 0.5);
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .agent-dirty {
            color: #ffc107;
        }

        .agent-banner {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 9px 11px;
            border-radius: 10px;
            font-size: 12px;
        }

        .agent-banner span {
            flex: 1;
        }

        .agent-banner.warn {
            background: rgba(255, 193, 7, 0.16);
            color: #ffdd7a;
        }

        .agent-banner.error {
            background: rgba(238, 27, 46, 0.2);
            color: #ff9d9d;
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
            

        /* ══════════════[ CARTÕES / BASE COMPARTILHADA ]══════════════ */
        .card {
            display: flex;
            flex-direction: column;
            gap: 12px;
            padding: 16px;
            background: rgba(255, 255, 255, 0.035);
            border: 1px solid rgba(255, 255, 255, 0.09);
            border-radius: 14px;
            box-sizing: border-box;
        }

        .card-title {
            font-size: 14.5px;
            font-weight: 600;
            color: white;
            margin: 0;
            letter-spacing: -0.2px;
        }

        .card-sub {
            font-size: 12px;
            color: rgba(255, 255, 255, 0.5);
            line-height: 1.45;
            margin: 0;
        }

        .section-label {
            font-size: 11px;
            font-weight: 600;
            letter-spacing: 0.4px;
            text-transform: uppercase;
            color: rgba(255, 255, 255, 0.42);
            margin: 4px 0 -2px 2px;
        }

        .field {
            display: flex;
            flex-direction: column;
            gap: 5px;
        }

        .field-label {
            font-size: 11.5px;
            color: rgba(255, 255, 255, 0.6);
            margin-left: 2px;
        }

        .field-input {
            width: 100%;
            box-sizing: border-box;
            background: rgba(0, 0, 0, 0.28);
            border: 1px solid rgba(255, 255, 255, 0.16);
            border-radius: 10px;
            color: white;
            font-size: 13px;
            padding: 9px 11px;
            outline: none;
            font-family: inherit;
            cursor: text;
            user-select: text;
            transition: border-color 0.15s ease, box-shadow 0.15s ease;
        }

        .field-input::placeholder {
            color: rgba(255, 255, 255, 0.32);
        }

        .field-input:focus,
        .field-input:focus-visible {
            border-color: rgba(238, 27, 46, 0.75);
            box-shadow: 0 0 0 3px rgba(238, 27, 46, 0.18);
        }

        .settings-button:focus-visible,
        .preset-action:focus-visible,
        .link-button:focus-visible,
        .switch:focus-visible,
        .nav-item:focus-visible {
            outline: 2px solid rgba(238, 27, 46, 0.85);
            outline-offset: 2px;
        }

        .link-button {
            align-self: flex-start;
            background: none;
            border: none;
            padding: 2px 0;
            font-size: 12px;
            font-family: inherit;
            color: rgba(255, 255, 255, 0.62);
            text-decoration: underline;
            text-underline-offset: 2px;
            cursor: pointer;
        }

        .link-button:hover {
            color: white;
        }

        .form-error {
            font-size: 11.5px;
            color: #ff9d9d;
            background: rgba(238, 27, 46, 0.16);
            border-radius: 9px;
            padding: 8px 10px;
            line-height: 1.4;
        }

        .form-notice {
            font-size: 11.5px;
            color: #a9e6bb;
            background: rgba(60, 200, 110, 0.14);
            border-radius: 9px;
            padding: 8px 10px;
            line-height: 1.4;
        }

        /* ══════════════[ ABA CONTA ]══════════════ */
        .account-head {
            display: flex;
            align-items: center;
            gap: 13px;
        }

        .avatar {
            width: 44px;
            height: 44px;
            flex-shrink: 0;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 15px;
            font-weight: 700;
            letter-spacing: 0.5px;
            color: white;
            background: rgba(238, 27, 46, 0.28);
            border: 1px solid rgba(238, 27, 46, 0.6);
        }

        .account-meta {
            display: flex;
            flex-direction: column;
            gap: 5px;
            min-width: 0;
            flex: 1;
        }

        .account-email {
            font-size: 13.5px;
            font-weight: 500;
            color: white;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            user-select: text;
        }

        .badge {
            align-self: flex-start;
            display: inline-flex;
            align-items: center;
            gap: 5px;
            font-size: 10.5px;
            font-weight: 600;
            padding: 3px 9px;
            border-radius: 999px;
            background: rgba(60, 200, 110, 0.16);
            color: #8fe0a8;
        }

        .badge .dot {
            width: 6px;
            height: 6px;
            border-radius: 50%;
            background: #62d68a;
        }

        .signup-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
        }

        .signup-row span {
            font-size: 12.5px;
            color: rgba(255, 255, 255, 0.6);
        }

        /* ══════════════[ ABA MODELOS & API ]══════════════ */
        .provider-card {
            display: flex;
            flex-direction: column;
            gap: 9px;
            padding: 13px 14px;
            background: rgba(255, 255, 255, 0.035);
            border: 1px solid rgba(255, 255, 255, 0.09);
            border-radius: 13px;
            box-sizing: border-box;
        }

        .provider-list {
            display: flex;
            flex-direction: column;
            gap: 9px;
        }

        .provider-head {
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .provider-logo {
            width: 32px;
            height: 32px;
            flex-shrink: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 9px;
            background: rgba(255, 255, 255, 0.07);
            border: 1px solid rgba(255, 255, 255, 0.1);
            color: rgba(255, 255, 255, 0.92);
        }

        .provider-logo svg {
            width: 20px;
            height: 20px;
        }

        .provider-name {
            flex: 1;
            font-size: 13.5px;
            font-weight: 600;
            color: white;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .chip {
            flex-shrink: 0;
            font-size: 10.5px;
            font-weight: 600;
            padding: 3px 9px;
            border-radius: 999px;
            background: rgba(255, 255, 255, 0.08);
            color: rgba(255, 255, 255, 0.5);
            white-space: nowrap;
        }

        .chip.ok {
            background: rgba(60, 200, 110, 0.16);
            color: #8fe0a8;
        }

        .chip.local {
            background: rgba(255, 255, 255, 0.08);
            color: rgba(255, 255, 255, 0.55);
            margin-right: 2px;
        }

        .provider-note {
            font-size: 11.5px;
            color: rgba(255, 255, 255, 0.48);
            line-height: 1.45;
            margin: -2px 0 0 0;
        }

        .provider-form {
            display: flex;
            align-items: flex-end;
            gap: 8px;
        }

        .provider-form .field {
            flex: 1;
            min-width: 0;
        }

        .provider-actions {
            display: flex;
            justify-content: flex-end;
            gap: 7px;
            flex-shrink: 0;
        }

        .provider-actions .settings-button {
            min-width: 84px;
            padding: 7px 14px;
            font-size: 12px;
            border-radius: 9px;
        }

        .model-picker {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .model-current {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .model-current-name {
            flex: 1;
            font-size: 13px;
            font-weight: 600;
            color: white;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .model-current-name.empty {
            color: rgba(255, 255, 255, 0.4);
            font-weight: 400;
        }

        .model-change {
            flex-shrink: 0;
            padding: 6px 12px;
            font-size: 11.5px;
            border-radius: 9px;
        }

        .model-list {
            gap: 3px;
            max-height: 150px;
            background: rgba(0, 0, 0, 0.32);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 10px;
            padding: 5px;
            margin-top: 0;
        }

        .model-item {
            padding: 7px 10px;
            font-size: 12px;
            border-radius: 8px;
        }

        /* ══════════════[ ABA ATALHOS ]══════════════ */
        .shortcut-list {
            display: flex;
            flex-direction: column;
            gap: 2px;
        }

        .shortcut-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            padding: 11px 4px;
            font-size: 13px;
            color: white;
        }

        .shortcut-row + .shortcut-row {
            border-top: 1px solid rgba(255, 255, 255, 0.07);
        }

        .shortcut-label {
            color: rgba(255, 255, 255, 0.85);
        }

        .kbd-group {
            display: flex;
            align-items: center;
            gap: 4px;
            flex-shrink: 0;
        }

        .kbd {
            min-width: 24px;
            height: 24px;
            padding: 0 6px;
            box-sizing: border-box;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            font-weight: 600;
            color: rgba(255, 255, 255, 0.92);
            background: rgba(255, 255, 255, 0.09);
            border: 1px solid rgba(255, 255, 255, 0.18);
            border-bottom-color: rgba(255, 255, 255, 0.28);
            border-radius: 7px;
        }

        .kbd.none {
            font-weight: 400;
            color: rgba(255, 255, 255, 0.4);
            background: transparent;
            border-style: dashed;
        }

        /* ══════════════[ ABA GERAL ]══════════════ */
        .toggle-row {
            display: flex;
            align-items: center;
            gap: 14px;
        }

        .toggle-row + .toggle-row {
            padding-top: 13px;
            border-top: 1px solid rgba(255, 255, 255, 0.07);
        }

        .toggle-text {
            display: flex;
            flex-direction: column;
            gap: 3px;
            flex: 1;
            min-width: 0;
        }

        .toggle-title {
            font-size: 13px;
            font-weight: 600;
            color: white;
        }

        .toggle-desc {
            font-size: 11.5px;
            color: rgba(255, 255, 255, 0.48);
            line-height: 1.4;
        }

        .switch {
            flex-shrink: 0;
            width: 42px;
            height: 24px;
            padding: 0;
            border-radius: 999px;
            border: 1px solid rgba(255, 255, 255, 0.16);
            background: rgba(255, 255, 255, 0.09);
            cursor: pointer;
            position: relative;
            transition: background 0.18s ease, border-color 0.18s ease;
        }

        .switch .switch-knob {
            position: absolute;
            top: 2px;
            left: 2px;
            width: 18px;
            height: 18px;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.85);
            transition: transform 0.18s ease, background 0.18s ease;
        }

        .switch.on {
            background: rgba(238, 27, 46, 0.85);
            border-color: rgba(238, 27, 46, 0.9);
        }

        .switch.on .switch-knob {
            transform: translateX(18px);
            background: white;
        }

        .switch[disabled] {
            opacity: 0.45;
            cursor: not-allowed;
        }

        .window-move {
            display: flex;
            gap: 8px;
        }

        .window-move .settings-button {
            flex: 1;
            border-radius: 10px;
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
        v4Auth: { type: Object, state: true },
        v4LoginError: { type: String, state: true },
        v4LoggingIn: { type: Boolean, state: true },
        v4RecoveryNotice: { type: String, state: true },
        v4RecoverySending: { type: Boolean, state: true },
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
        // Editor de agentes (aba 'Agentes', mesma janela)
        agentsMode: { type: String, state: true },
        agentDraftId: { type: String, state: true },
        agentDraftTitle: { type: String, state: true },
        agentDraftPrompt: { type: String, state: true },
        agentDraftIsDefault: { type: Boolean, state: true },
        agentDirty: { type: Boolean, state: true },
        agentSaving: { type: Boolean, state: true },
        agentError: { type: String, state: true },
        agentStatus: { type: String, state: true },
        agentPendingDeleteId: { type: String, state: true },
        agentConfirmDiscard: { type: Boolean, state: true },
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
        this.v4RecoveryNotice = '';
        this.v4RecoverySending = false;
        this.activeTab = 'agentes';
        this.agentsMode = 'list';
        this.agentDraftId = null;
        this.agentDraftTitle = '';
        this.agentDraftPrompt = '';
        this.agentDraftIsDefault = false;
        this.agentDirty = false;
        this.agentSaving = false;
        this.agentError = '';
        this.agentStatus = '';
        this.agentPendingDeleteId = null;
        this.agentConfirmDiscard = false;
        // Ollama related
        this.ollamaStatus = { installed: false, running: false };
        this.ollamaModels = [];
        this.installingModels = {}; // { modelName: progress }
        // Whisper related
        this.whisperModels = [];
        this.whisperProgressTracker = null; // Will be initialized when needed
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

    /** Abre a tela de conta na janela flutuante; esta janela fecha sozinha. */
    async handleV4ShowAccountScreen(screen) {
        try {
            await window.api.settingsView.v4ShowAccountScreen(screen);
        } catch (err) {
            this.v4LoginError = err.message;
        }
    }

    async handleV4Logout() {
        await window.api.settingsView.v4Logout();
        await this.loadV4AuthState();
    }

    /** Envia o link de recuperação para o e-mail digitado no campo acima. */
    async handleV4SendRecovery() {
        const email = (this.shadowRoot.querySelector('#v4-email')?.value || '').trim();
        this.v4RecoveryNotice = '';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            this.v4LoginError = 'Digite seu e-mail acima para receber o link de recuperação.';
            this.requestUpdate();
            return;
        }
        if (!window.api?.v4Auth?.sendRecovery) {
            this.v4LoginError = 'Recuperação indisponível nesta versão. Atualize o aplicativo.';
            this.requestUpdate();
            return;
        }
        this.v4LoginError = '';
        this.v4RecoverySending = true;
        this.requestUpdate();
        try {
            const result = await window.api.v4Auth.sendRecovery(email);
            if (result?.success) {
                this.v4RecoveryNotice = `Enviamos um link para ${email}. Crie a nova senha por lá e volte aqui para entrar.`;
            } else {
                this.v4LoginError = result?.error || 'Não foi possível enviar o e-mail. Tente de novo.';
            }
        } catch (error) {
            console.error('[SettingsView] Falha ao pedir recuperação:', error);
            this.v4LoginError = 'Não foi possível enviar o e-mail. Tente de novo.';
        } finally {
            this.v4RecoverySending = false;
            this.requestUpdate();
        }
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
            this.loadAutoUpdateSetting();
            // Reload model settings when user state changes
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
        // Com o editor de agentes aberto o texto está sendo escrito: sumir a
        // janela ao tirar o mouse faria o usuário perder o que digitou de vista.
        if (this.activeTab === 'agentes' && this.agentsMode === 'editor') return;
        window.api.settingsView.hideSettingsWindow();
    }


    getMainShortcuts() {
        return [
            { name: 'Mostrar / ocultar', accelerator: this.shortcuts.toggleVisibility },
            { name: 'Perguntar', accelerator: this.shortcuts.nextStep },
            { name: 'Rolar resposta para cima', accelerator: this.shortcuts.scrollUp },
            { name: 'Rolar resposta para baixo', accelerator: this.shortcuts.scrollDown },
        ];
    }

    renderShortcutKeys(accelerator) {
        if (!accelerator) return html`<span class="kbd none">não definido</span>`;

        const keyMap = {
            'Cmd': '⌘', 'Command': '⌘', 'Ctrl': '⌃', 'Alt': '⌥', 'Shift': '⇧', 'Enter': '↵',
            'Up': '↑', 'Down': '↓', 'Left': '←', 'Right': '→'
        };

        // scrollDown/scrollUp의 특수 처리
        if (accelerator.includes('↕')) {
            const keys = accelerator.replace('↕','').split('+');
            keys.push('↕');
             return html`${keys.map(key => html`<span class="kbd">${keyMap[key] || key}</span>`)}`;
        }

        const keys = accelerator.split('+');
        return html`${keys.map(key => html`<span class="kbd">${keyMap[key] || key}</span>`)}`;
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

    // ── Editor de agentes: vive na aba 'Agentes', sem abrir outra janela ──

    /** Abre o editor no lugar da lista. `preset` nulo cria um agente novo. */
    openAgentEditor(preset) {
        const isDefault = preset ? preset.is_default === 1 : false;
        this.agentDraftId = preset ? preset.id : null;
        // Ao editar um playbook de fábrica, o nome já vem sugerido: o original
        // continua na lista e dois itens com o mesmo nome confundiriam. O usuário
        // vê a sugestão antes de salvar e pode trocá-la.
        this.agentDraftTitle = preset ? (isDefault ? `${preset.title} (minha versão)` : preset.title) : '';
        this.agentDraftPrompt = preset ? (preset.prompt || '') : '';
        this.agentDraftIsDefault = isDefault;
        this.agentDirty = isDefault;
        this.agentError = '';
        this.agentStatus = '';
        this.agentConfirmDiscard = false;
        this.agentPendingDeleteId = null;
        this.agentsMode = 'editor';
        this.requestUpdate();
    }

    /** Volta para a lista. Com rascunho pendente, pede confirmação antes. */
    backToAgentList(force = false) {
        if (this.agentDirty && !force) {
            this.agentConfirmDiscard = true;
            this.requestUpdate();
            return;
        }
        this.agentsMode = 'list';
        this.agentDirty = false;
        this.agentConfirmDiscard = false;
        this.agentError = '';
        this.agentStatus = '';
        this.refreshPresets();
    }

    async refreshPresets() {
        try {
            const presets = await window.api.settingsView.getPresets();
            this.presets = presets || [];
            this.selectedPreset = this.presets.find(p => p.is_active === 1) || null;
        } catch (error) {
            console.error('[SettingsView] Failed to refresh presets:', error);
        }
        this.requestUpdate();
    }

    async handleAgentSave() {
        if (this.agentSaving) return;

        const title = (this.agentDraftTitle || '').trim();
        if (!title) {
            this.agentError = 'Dê um nome ao agente antes de salvar.';
            this.requestUpdate();
            return;
        }

        this.agentSaving = true;
        this.agentError = '';
        this.requestUpdate();
        try {
            let result;
            if (this.agentDraftId) {
                result = await window.api.settingsView.updatePreset(this.agentDraftId, title, this.agentDraftPrompt);
            } else {
                result = await window.api.settingsView.createPreset(title, this.agentDraftPrompt);
                if (result && result.success !== false && result.id) this.agentDraftId = result.id;
            }

            if (result && result.success === false) {
                this.agentError = result.error || 'Não foi possível salvar o agente.';
                return;
            }

            // Editar um playbook de fábrica o "adota": o agente salvo é do usuário,
            // com id novo, e daqui em diante é uma edição comum.
            const wasDefault = this.agentDraftIsDefault;
            if (result && result.adopted && result.id) {
                this.agentDraftId = result.id;
                this.agentDraftIsDefault = false;
            }

            this.agentDirty = false;
            this.agentStatus = wasDefault ? 'salvo como seu agente' : 'salvo';
            await this.refreshPresets();
        } catch (error) {
            console.error('[SettingsView] Failed to save agent:', error);
            this.agentError = 'Não foi possível salvar o agente.';
        } finally {
            this.agentSaving = false;
            this.requestUpdate();
        }
    }

    async handleAgentDuplicate(preset) {
        this.agentSaving = true;
        this.agentError = '';
        this.requestUpdate();
        try {
            const result = await window.api.settingsView.createPreset(`${preset.title} (cópia)`, preset.prompt || '');
            if (result && result.success === false) {
                this.agentError = result.error || 'Não foi possível duplicar o agente.';
                return;
            }
            await this.refreshPresets();
            const created = this.presets.find(p => p.id === result.id);
            if (created) this.openAgentEditor(created);
        } catch (error) {
            console.error('[SettingsView] Failed to duplicate agent:', error);
            this.agentError = 'Não foi possível duplicar o agente.';
        } finally {
            this.agentSaving = false;
            this.requestUpdate();
        }
    }

    async handleAgentDelete(preset) {
        this.agentPendingDeleteId = null;
        try {
            const wasActive = preset.is_active === 1;
            const result = await window.api.settingsView.deletePreset(preset.id);
            if (result && result.success === false) {
                this.agentError = result.error || 'Não foi possível excluir o agente.';
                this.requestUpdate();
                return;
            }
            if (wasActive) await window.api.settingsView.setActivePreset(null);
            await this.refreshPresets();
        } catch (error) {
            console.error('[SettingsView] Failed to delete agent:', error);
            this.agentError = 'Não foi possível excluir o agente.';
            this.requestUpdate();
        }
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

        const initials = (email) => {
            const user = (email || '').split('@')[0] || '';
            const parts = user.split(/[._\-+]/).filter(Boolean);
            const letters = parts.length >= 2 ? parts[0][0] + parts[1][0] : user.slice(0, 2);
            return (letters || '?').toUpperCase();
        };

        const v4AuthHTML = this.v4Auth?.loggedIn
            ? html`
                  <div class="card">
                      <div class="account-head">
                          <div class="avatar">${initials(this.v4Auth.email)}</div>
                          <div class="account-meta">
                              <span class="account-email">${this.v4Auth.email}</span>
                              <span class="badge"><span class="dot"></span>Conectado</span>
                          </div>
                      </div>
                      <button class="settings-button danger full-width" @click=${() => this.handleV4Logout()}>
                          Sair da conta
                      </button>
                  </div>
              `
            : html`
                  <div class="card">
                      <h3 class="card-title">Entrar na sua conta</h3>
                      <div class="field">
                          <span class="field-label">E-mail</span>
                          <input class="field-input" type="email" id="v4-email" placeholder="voce@empresa.com"
                                 @input=${() => { if (this.v4LoginError || this.v4RecoveryNotice) { this.v4LoginError = ''; this.v4RecoveryNotice = ''; this.requestUpdate(); } }} />
                      </div>
                      <div class="field">
                          <span class="field-label">Senha</span>
                          <input class="field-input" type="password" id="v4-password" placeholder="Sua senha"
                                 @keydown=${e => { if (e.key === 'Enter') this.handleV4Login(); }} />
                      </div>
                      ${this.v4LoginError ? html`<div class="form-error">${this.v4LoginError}</div>` : ''}
                      ${this.v4RecoveryNotice ? html`<div class="form-notice">${this.v4RecoveryNotice}</div>` : ''}
                      <button class="settings-button primary full-width" ?disabled=${this.v4LoggingIn} @click=${() => this.handleV4Login()}>
                          ${this.v4LoggingIn ? 'Entrando…' : 'Entrar'}
                      </button>
                      <button class="link-button" ?disabled=${this.v4RecoverySending} @click=${() => this.handleV4SendRecovery()}>
                          ${this.v4RecoverySending ? 'Enviando…' : 'Esqueci minha senha'}
                      </button>
                  </div>
                  <div class="card">
                      <div class="signup-row">
                          <span>Ainda não tem conta?</span>
                          <button class="settings-button" @click=${() => this.handleV4ShowAccountScreen('signup')}>
                              Criar conta
                          </button>
                      </div>
                  </div>
              `;

        // Marcas simplificadas, monocromáticas e inline — sem assets externos.
        const providerLogos = {
            openai: svg`<g fill="none" stroke="currentColor" stroke-width="1.5">
                <ellipse cx="12" cy="12" rx="3.4" ry="9"/>
                <ellipse cx="12" cy="12" rx="3.4" ry="9" transform="rotate(60 12 12)"/>
                <ellipse cx="12" cy="12" rx="3.4" ry="9" transform="rotate(120 12 12)"/>
            </g>`,
            gemini: svg`<path fill="currentColor" d="M12 2c.45 4.9 5.1 9.55 10 10-4.9.45-9.55 5.1-10 10-.45-4.9-5.1-9.55-10-10 4.9-.45 9.55-5.1 10-10z"/>`,
            anthropic: svg`<path fill="currentColor" fill-rule="evenodd" d="M13.05 3.6h-2.1L4.2 20.4h3.5l1.4-3.65h5.8l1.4 3.65h3.5L13.05 3.6zM10.2 13.75L12 9.05l1.8 4.7h-3.6z"/>`,
            deepgram: svg`<g fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round">
                <path d="M6.5 4.2h4.6a7.8 7.8 0 0 1 0 15.6H6.5V4.2z"/>
                <path d="M10.4 9.4v5.2M13.6 10.6v2.8"/>
            </g>`,
            ollama: svg`<g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                <path d="M8.4 6.4c-.5-1.6-.3-3 .6-3.2.9-.2 1.8.9 2.1 2.5M15.6 6.4c.5-1.6.3-3-.6-3.2-.9-.2-1.8.9-2.1 2.5"/>
                <path d="M12 5.4c3 0 5 2.3 5 5.3 0 1.9-.7 2.9-.7 4.3 0 1.4.8 2 .8 3.4v2.2H6.9v-2.2c0-1.4.8-2 .8-3.4 0-1.4-.7-2.4-.7-4.3 0-3 2-5.3 5-5.3z"/>
                <path d="M10.3 11.2h.01M13.7 11.2h.01"/>
            </g>`,
            whisper: svg`<g fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round">
                <path d="M3.5 12h.6M7.2 8.4v7.2M12 4.8v14.4M16.8 8.4v7.2M20.5 12h-.6"/>
            </g>`,
        };
        const fallbackLogo = svg`<g fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="8.5" cy="12" r="3.5"/><path d="M12 12h8M17.5 12v3M20 12v2.5"/>
        </g>`;
        const providerLogo = (id) => html`
            <span class="provider-logo">
                <svg viewBox="0 0 24 24">${providerLogos[id] || fallbackLogo}</svg>
            </span>
        `;
        const cleanProviderName = (name) => (name || '').replace(/\s*\((Local|Local STT)\)\s*$/i, '').trim();

        const apiKeyManagementHTML = html`
            <div class="provider-list">
                ${Object.entries(this.providerConfig)
                    .map(([id, config]) => {
                        const name = cleanProviderName(config.name);

                        if (id === 'ollama') {
                            const running = this.ollamaStatus.installed && this.ollamaStatus.running;
                            return html`
                                <div class="provider-card">
                                    <div class="provider-head">
                                        ${providerLogo(id)}
                                        <span class="provider-name">${name}</span>
                                        <span class="chip local">Local</span>
                                        <span class="chip ${running ? 'ok' : ''}">${running ? 'Ativado' : 'Desativado'}</span>
                                    </div>
                                    <p class="provider-note">
                                        ${running
                                            ? 'Rodando na sua máquina, sem enviar dados para fora.'
                                            : this.ollamaStatus.installed
                                                ? 'Instalado, mas o serviço está parado.'
                                                : 'Ainda não instalado. Ativar faz a instalação automática.'}
                                    </p>
                                    <div class="provider-actions">
                                        ${running
                                            ? html`<button class="settings-button danger" @click=${this.handleOllamaShutdown}>Desativar</button>`
                                            : html`<button class="settings-button" @click=${() => this.handleSaveKey(id)}>Ativar</button>`}
                                    </div>
                                </div>
                            `;
                        }

                        if (id === 'whisper') {
                            const enabled = this.apiKeys[id] === 'local';
                            return html`
                                <div class="provider-card">
                                    <div class="provider-head">
                                        ${providerLogo(id)}
                                        <span class="provider-name">${name}</span>
                                        <span class="chip local">Local</span>
                                        <span class="chip ${enabled ? 'ok' : ''}">${enabled ? 'Ativado' : 'Desativado'}</span>
                                    </div>
                                    <p class="provider-note">
                                        Transcrição feita no seu computador, sem chave de API.
                                    </p>
                                    <div class="provider-actions">
                                        ${enabled
                                            ? html`<button class="settings-button danger" @click=${() => this.handleClearKey(id)}>Desativar</button>`
                                            : html`<button class="settings-button" @click=${() => this.handleSaveKey(id)}>Ativar</button>`}
                                    </div>
                                </div>
                            `;
                        }

                        const configured = !!this.apiKeys[id];
                        return html`
                            <div class="provider-card">
                                <div class="provider-head">
                                    ${providerLogo(id)}
                                    <span class="provider-name">${name}</span>
                                    <span class="chip ${configured ? 'ok' : ''}">${configured ? 'Configurada' : 'Não configurada'}</span>
                                </div>
                                <div class="provider-form">
                                    <div class="field">
                                        <span class="field-label">Chave de API</span>
                                        <input class="field-input" type="password" id="key-input-${id}"
                                            placeholder=${`Cole a chave da ${name}`}
                                            .value=${this.apiKeys[id] || ''}
                                        >
                                    </div>
                                    <div class="provider-actions">
                                        <button class="settings-button" @click=${() => this.handleSaveKey(id)}>Salvar</button>
                                        <button class="settings-button danger" @click=${() => this.handleClearKey(id)}>Limpar</button>
                                    </div>
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
            <div class="card">
                <div class="model-picker">
                    <span class="field-label">Modelo de IA</span>
                    <div class="model-current">
                        <span class="model-current-name ${this.selectedLlm ? '' : 'empty'}">
                            ${getModelName('llm', this.selectedLlm) || 'Nenhum definido'}
                        </span>
                        <button class="settings-button model-change" @click=${() => this.toggleModelList('llm')} ?disabled=${this.saving || this.availableLlmModels.length === 0}>
                            ${this.isLlmListVisible ? 'Fechar' : 'Alterar'}
                        </button>
                    </div>
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
                                                <span class="model-status installed">✓ Instalado</span>
                                            ` : html`
                                                <span class="model-status not-installed">Clique para instalar</span>
                                            `}
                                        ` : ''}
                                    </div>
                                `;
                            })}
                        </div>
                    ` : ''}
                </div>

                <div class="model-picker">
                    <span class="field-label">Transcrição</span>
                    <div class="model-current">
                        <span class="model-current-name ${this.selectedStt ? '' : 'empty'}">
                            ${getModelName('stt', this.selectedStt) || 'Nenhum definido'}
                        </span>
                        <button class="settings-button model-change" @click=${() => this.toggleModelList('stt')} ?disabled=${this.saving || this.availableSttModels.length === 0}>
                            ${this.isSttListVisible ? 'Fechar' : 'Alterar'}
                        </button>
                    </div>
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
                                                <span class="model-status installed">✓ Instalado</span>
                                            ` : html`
                                                <span class="model-status not-installed">Não instalado</span>
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

        const pencilIcon = icon(svg`<path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3z"/><path d="M13.5 6.5l4 4"/>`);
        const copyIcon = icon(svg`<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>`);
        const trashIcon = icon(svg`<path d="M4 7h16M10 7V5h4v2M6 7l1 13h10l1-13"/>`);
        const backIcon = icon(svg`<path d="M14.5 5.5L8 12l6.5 6.5"/>`);

        const agentRow = (preset) => {
            const isDefault = preset.is_default === 1;
            const isActive = preset.is_active === 1;

            if (this.agentPendingDeleteId === preset.id) {
                return html`
                    <div class="preset-item confirming">
                        <span class="confirm-text">Excluir "${preset.title}"?</span>
                        <div class="preset-actions">
                            <button class="preset-action danger" @click=${() => this.handleAgentDelete(preset)}>
                                Excluir
                            </button>
                            <button class="preset-action" @click=${() => { this.agentPendingDeleteId = null; this.requestUpdate(); }}>
                                Cancelar
                            </button>
                        </div>
                    </div>
                `;
            }

            return html`
                <div class="preset-item ${isActive ? 'selected' : ''}"
                     @click=${() => this.handlePresetSelect(preset)}>
                    <span class="preset-check">${isActive ? '✓' : ''}</span>
                    <span class="preset-name">${preset.title}</span>
                    ${isActive ? html`<span class="preset-status">Ativo</span>` : ''}
                    <div class="preset-actions" @click=${e => e.stopPropagation()}>
                        <button class="preset-action" title="Editar este agente"
                                @click=${() => this.openAgentEditor(preset)}>
                            ${pencilIcon} Editar
                        </button>
                        <button class="preset-action" title="Duplicar"
                                @click=${() => this.handleAgentDuplicate(preset)}>
                            ${copyIcon}
                        </button>
                        ${isDefault ? '' : html`
                            <button class="preset-action danger" title="Excluir"
                                    @click=${() => { this.agentPendingDeleteId = preset.id; this.requestUpdate(); }}>
                                ${trashIcon}
                            </button>
                        `}
                    </div>
                </div>
            `;
        };

        const agentsListPane = html`
            <h2 class="content-title">Agentes</h2>
            <p class="content-hint">
                O agente ativo guia as sugestões ao vivo durante a call.
                Clique no nome para ativar; clique no ativo para voltar ao playbook padrão (Closer).
            </p>
            ${this.agentError ? html`
                <div class="agent-banner error"><span>${this.agentError}</span></div>
            ` : ''}
            <div class="preset-list">
                ${this.presets.length === 0 ? html`
                    <div class="no-presets-message">
                        Nenhum agente ainda.<br>
                        <span class="web-link" @click=${() => this.openAgentEditor(null)}>
                            Criar seu primeiro agente
                        </span>
                    </div>
                ` : this.presets.map(preset => agentRow(preset))}
            </div>
            <div class="buttons-section">
                <button class="settings-button primary full-width" @click=${() => this.openAgentEditor(null)}>
                    <span>+ Novo agente</span>
                </button>
                <button class="settings-button full-width" @click=${this.handlePersonalize}>
                    <span>Abrir no navegador</span>
                </button>
            </div>
        `;

        const agentChars = (this.agentDraftPrompt || '').length;
        const agentsEditorPane = html`
            <div class="agent-editor-head">
                <button class="agent-back" @click=${() => this.backToAgentList()}>
                    ${backIcon} Voltar
                </button>
                <h2 class="content-title" style="margin:0;">
                    ${this.agentDraftId ? 'Editar agente' : 'Novo agente'}
                </h2>
            </div>

            ${this.agentConfirmDiscard ? html`
                <div class="agent-banner warn">
                    <span>Descartar as alterações não salvas?</span>
                    <button class="preset-action danger" @click=${() => this.backToAgentList(true)}>Descartar</button>
                    <button class="preset-action" @click=${() => { this.agentConfirmDiscard = false; this.requestUpdate(); }}>Continuar editando</button>
                </div>
            ` : ''}

            ${this.agentError ? html`
                <div class="agent-banner error"><span>${this.agentError}</span></div>
            ` : ''}

            ${this.agentDraftIsDefault ? html`
                <div class="agent-banner warn">
                    <span>
                        Este é um playbook de fábrica. Ao salvar, esta vira a <strong>sua versão</strong>
                        e o playbook original continua na lista, com o texto de fábrica.
                    </span>
                </div>
            ` : ''}

            <div class="agent-field">
                <span class="agent-field-label">Nome</span>
                <input
                    class="agent-input"
                    type="text"
                    .value=${this.agentDraftTitle}
                    placeholder="Ex.: Pré-venda — Ligação"
                    @input=${e => { this.agentDraftTitle = e.target.value; this.agentDirty = true; this.agentStatus = ''; this.requestUpdate(); }}
                />
            </div>

            <div class="agent-field grow">
                <span class="agent-field-label">Instruções</span>
                <textarea
                    class="agent-textarea"
                    .value=${this.agentDraftPrompt}
                    placeholder="Descreva como este agente deve orientar as sugestões durante a conversa..."
                    @input=${e => { this.agentDraftPrompt = e.target.value; this.agentDirty = true; this.agentStatus = ''; this.requestUpdate(); }}
                ></textarea>
            </div>

            <div class="agent-editor-footer">
                <span class="agent-counter">
                    ${agentChars.toLocaleString('pt-BR')} caracteres
                    ${this.agentDirty ? html`<span class="agent-dirty">· não salvo</span>` : ''}
                    ${this.agentStatus ? html`· ${this.agentStatus}` : ''}
                </span>
                <button class="preset-action" title="Editar a versão completa no navegador" @click=${this.handlePersonalize}>
                    Abrir no navegador
                </button>
                <button
                    class="settings-button primary"
                    ?disabled=${this.agentSaving || !this.agentDirty}
                    @click=${() => this.handleAgentSave()}
                >
                    <span>${this.agentSaving ? 'Salvando...' : (this.agentDraftIsDefault ? 'Salvar minha versão' : 'Salvar')}</span>
                </button>
            </div>
        `;

        const agentesPane = this.agentsMode === 'editor' ? agentsEditorPane : agentsListPane;

        const contaPane = html`
            <h2 class="content-title">Conta</h2>
            <p class="content-hint">
                Sua conta V4 sincroniza agentes e histórico entre o app e o painel web.
            </p>
            ${v4AuthHTML}
        `;

        const modelosPane = html`
            <h2 class="content-title">Modelos &amp; API</h2>
            <p class="content-hint">
                Conecte pelo menos um provedor de IA e um de transcrição para o copiloto funcionar na call.
            </p>
            <div class="section-label">Provedores</div>
            ${apiKeyManagementHTML}
            <div class="section-label">Modelos em uso</div>
            ${modelSelectionHTML}
        `;

        const atalhosPane = html`
            <h2 class="content-title">Atalhos</h2>
            <p class="content-hint">
                Teclas de atalho globais — funcionam mesmo com o Copiloto em segundo plano.
            </p>
            <div class="card">
                <div class="shortcut-list">
                    ${this.getMainShortcuts().map(shortcut => html`
                        <div class="shortcut-row">
                            <span class="shortcut-label">${shortcut.name}</span>
                            <div class="kbd-group">
                                ${this.renderShortcutKeys(shortcut.accelerator)}
                            </div>
                        </div>
                    `)}
                </div>
            </div>
            <div class="buttons-section">
                <button class="settings-button full-width" @click=${this.openShortcutEditor}>
                    Editar atalhos
                </button>
            </div>
        `;

        const geralPane = html`
            <h2 class="content-title">Geral</h2>
            <p class="content-hint">
                Ajustes do aplicativo e da janela flutuante.
            </p>
            <div class="card">
                <div class="toggle-row">
                    <div class="toggle-text">
                        <span class="toggle-title">Atualizações automáticas</span>
                        <span class="toggle-desc">Baixa e instala novas versões do Copiloto sozinho.</span>
                    </div>
                    <button
                        class="switch ${this.autoUpdateEnabled ? 'on' : ''}"
                        role="switch"
                        aria-checked=${this.autoUpdateEnabled ? 'true' : 'false'}
                        aria-label="Atualizações automáticas"
                        ?disabled=${this.autoUpdateLoading}
                        @click=${this.handleToggleAutoUpdate}
                    ><span class="switch-knob"></span></button>
                </div>
                <div class="toggle-row">
                    <div class="toggle-text">
                        <span class="toggle-title">Modo invisível</span>
                        <span class="toggle-desc">Esconde a janela de compartilhamentos de tela e gravações.</span>
                    </div>
                    <button
                        class="switch ${this.isContentProtectionOn ? 'on' : ''}"
                        role="switch"
                        aria-checked=${this.isContentProtectionOn ? 'true' : 'false'}
                        aria-label="Modo invisível"
                        @click=${this.handleToggleInvisibility}
                    ><span class="switch-knob"></span></button>
                </div>
            </div>

            <div class="card">
                <div class="toggle-text">
                    <span class="toggle-title">Posição da janela</span>
                    <span class="toggle-desc">Move a janela flutuante um passo para cada lado.</span>
                </div>
                <div class="window-move">
                    <button class="settings-button" @click=${this.handleMoveLeft}>
                        <span>← Mover</span>
                    </button>
                    <button class="settings-button" @click=${this.handleMoveRight}>
                        <span>Mover →</span>
                    </button>
                </div>
            </div>

            <div class="buttons-section">
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