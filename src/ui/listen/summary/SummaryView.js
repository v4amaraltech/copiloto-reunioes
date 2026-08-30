import { html, css, LitElement } from '../../assets/lit-core-2.7.4.min.js';

export class SummaryView extends LitElement {
    static styles = css`
        :host {
            display: block;
            width: 100%;
        }

        /* Inherit font styles from parent */

        /* highlight.js 스타일 추가 */
        .insights-container pre {
            background: rgba(0, 0, 0, 0.4) !important;
            border-radius: 8px !important;
            padding: 12px !important;
            margin: 8px 0 !important;
            overflow-x: auto !important;
            border: 1px solid rgba(255, 255, 255, 0.1) !important;
            white-space: pre !important;
            word-wrap: normal !important;
            word-break: normal !important;
        }

        .insights-container code {
            font-family: 'Monaco', 'Menlo', 'Consolas', monospace !important;
            font-size: 11px !important;
            background: transparent !important;
            white-space: pre !important;
            word-wrap: normal !important;
            word-break: normal !important;
        }

        .insights-container pre code {
            white-space: pre !important;
            word-wrap: normal !important;
            word-break: normal !important;
            display: block !important;
        }

        .insights-container p code {
            background: rgba(255, 255, 255, 0.1) !important;
            padding: 2px 4px !important;
            border-radius: 3px !important;
            color: #ffd700 !important;
        }

        .hljs-keyword {
            color: #ff79c6 !important;
        }
        .hljs-string {
            color: #f1fa8c !important;
        }
        .hljs-comment {
            color: #6272a4 !important;
        }
        .hljs-number {
            color: #bd93f9 !important;
        }
        .hljs-function {
            color: #50fa7b !important;
        }
        .hljs-variable {
            color: #8be9fd !important;
        }
        .hljs-built_in {
            color: #ffb86c !important;
        }
        .hljs-title {
            color: #50fa7b !important;
        }
        .hljs-attr {
            color: #50fa7b !important;
        }
        .hljs-tag {
            color: #ff79c6 !important;
        }

        .insights-container {
            overflow-y: auto;
            padding: 12px 16px 16px 16px;
            position: relative;
            z-index: 1;
            min-height: 150px;
            max-height: 600px;
            flex: 1;
        }

        /* Visibility handled by parent component */

        .insights-container::-webkit-scrollbar {
            width: 8px;
        }
        .insights-container::-webkit-scrollbar-track {
            background: rgba(0, 0, 0, 0.1);
            border-radius: 4px;
        }
        .insights-container::-webkit-scrollbar-thumb {
            background: rgba(255, 255, 255, 0.3);
            border-radius: 4px;
        }
        .insights-container::-webkit-scrollbar-thumb:hover {
            background: rgba(255, 255, 255, 0.5);
        }

        insights-title {
            color: rgba(255, 255, 255, 0.8);
            font-size: 15px;
            font-weight: 500;
            font-family: 'Helvetica Neue', sans-serif;
            margin: 12px 0 8px 0;
            display: block;
        }

        .insights-container h4 {
            color: #ffffff;
            font-size: 12px;
            font-weight: 600;
            margin: 12px 0 8px 0;
            padding: 4px 8px;
            border-radius: 4px;
            background: transparent;
            cursor: default;
        }

        .insights-container h4:hover {
            background: transparent;
        }

        .insights-container h4:first-child {
            margin-top: 0;
        }

        .outline-item {
            color: #ffffff;
            font-size: 11px;
            line-height: 1.4;
            margin: 4px 0;
            padding: 6px 8px;
            border-radius: 4px;
            background: transparent;
            transition: background-color 0.15s ease;
            cursor: pointer;
            word-wrap: break-word;
        }

        .outline-item:hover {
            background: rgba(255, 255, 255, 0.1);
        }

        .request-item {
            color: #ffffff;
            font-size: 12px;
            line-height: 1.2;
            margin: 4px 0;
            padding: 6px 8px;
            border-radius: 4px;
            background: transparent;
            cursor: default;
            word-wrap: break-word;
            transition: background-color 0.15s ease;
        }

        .request-item.clickable {
            cursor: pointer;
            transition: all 0.15s ease;
        }
        .request-item.clickable:hover {
            background: rgba(255, 255, 255, 0.1);
            transform: translateX(2px);
        }

        /* 마크다운 렌더링된 콘텐츠 스타일 */
        .markdown-content {
            color: #ffffff;
            font-size: 11px;
            line-height: 1.4;
            margin: 4px 0;
            padding: 6px 8px;
            border-radius: 4px;
            background: transparent;
            cursor: pointer;
            word-wrap: break-word;
            transition: all 0.15s ease;
        }

        .markdown-content:hover {
            background: rgba(255, 255, 255, 0.1);
            transform: translateX(2px);
        }

        .markdown-content p {
            margin: 4px 0;
        }

        .markdown-content ul,
        .markdown-content ol {
            margin: 4px 0;
            padding-left: 16px;
        }

        .markdown-content li {
            margin: 2px 0;
        }

        .markdown-content a {
            color: #8be9fd;
            text-decoration: none;
        }

        .markdown-content a:hover {
            text-decoration: underline;
        }

        .markdown-content strong {
            font-weight: 600;
            color: #f8f8f2;
        }

        .markdown-content em {
            font-style: italic;
            color: #f1fa8c;
        }

        .empty-state {
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100px;
            color: rgba(255, 255, 255, 0.6);
            font-size: 12px;
            font-style: italic;
        }

        .briefing-section {
            padding: 6px 12px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .briefing-toggle {
            display: flex;
            align-items: center;
            justify-content: space-between;
            cursor: pointer;
            font-size: 11px;
            font-weight: 600;
            color: rgba(255, 255, 255, 0.8);
            padding: 4px 0;
        }

        .briefing-status {
            font-size: 10px;
            font-weight: 400;
            color: rgba(120, 220, 140, 0.9);
        }

        .briefing-textarea {
            width: 100%;
            min-height: 90px;
            box-sizing: border-box;
            margin-top: 6px;
            background: rgba(0, 0, 0, 0.3);
            border: 1px solid rgba(255, 255, 255, 0.15);
            border-radius: 6px;
            color: rgba(255, 255, 255, 0.9);
            font-size: 11px;
            font-family: inherit;
            padding: 8px;
            resize: vertical;
        }

        .briefing-save {
            margin-top: 6px;
            background: rgba(255, 255, 255, 0.12);
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 5px;
            color: rgba(255, 255, 255, 0.9);
            font-size: 11px;
            padding: 4px 12px;
            cursor: pointer;
        }

        .briefing-save:hover {
            background: rgba(255, 255, 255, 0.2);
        }

        .lead-search-row {
            display: flex;
            gap: 6px;
            margin-top: 6px;
        }

        .lead-search-input {
            flex: 1;
            background: rgba(0, 0, 0, 0.3);
            border: 1px solid rgba(255, 255, 255, 0.15);
            border-radius: 5px;
            color: rgba(255, 255, 255, 0.9);
            font-size: 11px;
            padding: 5px 8px;
        }

        .lead-search-error {
            font-size: 10px;
            color: rgba(255, 160, 120, 0.95);
            margin-top: 4px;
        }

        .lead-result {
            margin-top: 4px;
            padding: 5px 8px;
            background: rgba(255, 255, 255, 0.08);
            border-radius: 5px;
            font-size: 11px;
            color: rgba(255, 255, 255, 0.9);
            cursor: pointer;
        }

        .lead-result:hover {
            background: rgba(238, 27, 46, 0.25);
        }

        .suggestion-current {
            margin: 4px 12px 10px 12px;
            padding: 12px 14px;
            background: linear-gradient(135deg, rgba(238, 27, 46, 0.22) 0%, rgba(238, 27, 46, 0.10) 100%);
            border: 1px solid rgba(238, 27, 46, 0.45);
            border-left: 3px solid #ee1b2e;
            border-radius: 10px;
            box-shadow: 0 4px 16px rgba(238, 27, 46, 0.12);
            color: #ffffff;
            font-size: 15px;
            line-height: 1.5;
            font-weight: 500;
            cursor: pointer;
        }

        .suggestion-current:hover {
            background: linear-gradient(135deg, rgba(238, 27, 46, 0.30) 0%, rgba(238, 27, 46, 0.16) 100%);
        }

        .suggestion-current.streaming {
            cursor: default;
        }

        .suggestion-cursor {
            display: inline-block;
            width: 7px;
            height: 14px;
            margin-left: 3px;
            vertical-align: middle;
            background: rgba(255, 255, 255, 0.85);
            animation: blink 0.9s step-end infinite;
        }

        @keyframes blink {
            50% { opacity: 0; }
        }

        .copied-badge {
            font-size: 10px;
            font-weight: 400;
            color: rgba(120, 220, 140, 0.95);
            margin-left: 6px;
        }

        .suggestion-history-item {
            margin: 2px 12px;
            padding: 6px 10px;
            border-left: 2px solid rgba(255, 255, 255, 0.2);
            color: rgba(255, 255, 255, 0.55);
            font-size: 12px;
            line-height: 1.4;
            cursor: pointer;
        }

        .suggestion-history-item:hover {
            color: rgba(255, 255, 255, 0.85);
        }
    `;

    static properties = {
        structuredData: { type: Object },
        isVisible: { type: Boolean },
        hasCompletedRecording: { type: Boolean },
        briefingOpen: { type: Boolean },
        briefingText: { type: String },
        briefingSaved: { type: Boolean },
        streamingText: { type: String },
        isStreaming: { type: Boolean },
        suggestionHistory: { type: Array },
        copied: { type: Boolean },
        leadResults: { type: Array },
        leadSearchError: { type: String },
        leadSearching: { type: Boolean },
    };

    constructor() {
        super();
        this.structuredData = {
            summary: [],
            topic: { header: '', bullets: [] },
            actions: [],
            followUps: [],
        };
        this.isVisible = true;
        this.briefingOpen = false;
        this.briefingText = '';
        this.briefingSaved = false;
        this.streamingText = '';
        this.isStreaming = false;
        this.suggestionHistory = [];
        this.copied = false;
        this.leadResults = [];
        this.leadSearchError = '';
        this.leadSearching = false;
        this.hasCompletedRecording = false;

        // 마크다운 라이브러리 초기화
        this.marked = null;
        this.hljs = null;
        this.isLibrariesLoaded = false;
        this.DOMPurify = null;
        this.isDOMPurifyLoaded = false;

        this.loadLibraries();
    }

    connectedCallback() {
        super.connectedCallback();
        if (window.api) {
            window.api.summaryView.onSummaryUpdate((event, data) => {
                const previous = this.structuredData?.suggestion;
                if (previous && data?.suggestion && previous !== data.suggestion) {
                    this.suggestionHistory = [previous, ...this.suggestionHistory].slice(0, 4);
                }
                this.structuredData = data;
                this.isStreaming = false;
                this.streamingText = '';
                this.requestUpdate();
            });
            window.api.summaryView.onSummaryStream((event, { text, done }) => {
                this.streamingText = text;
                this.isStreaming = !done;
            });
            window.api.summaryView.getLeadBriefing().then(text => {
                this.briefingText = text || '';
                this.briefingSaved = !!text;
            }).catch(() => {});
            window.api.summaryView.onBriefingUpdated((event, { briefing }) => {
                this.briefingText = briefing || '';
                this.briefingSaved = !!briefing;
                this.briefingOpen = false;
            });
        }
    }

    async copySuggestion(text) {
        try {
            await navigator.clipboard.writeText(text);
            this.copied = true;
            setTimeout(() => (this.copied = false), 1200);
        } catch (_) {}
    }

    async searchLead() {
        const input = this.shadowRoot.querySelector('.lead-search-input');
        const query = input ? input.value.trim() : '';
        if (query.length < 2) {
            this.leadSearchError = 'Digite pelo menos 2 caracteres.';
            return;
        }
        this.leadSearching = true;
        this.leadSearchError = '';
        this.leadResults = [];
        try {
            this.leadResults = await window.api.summaryView.searchLeads(query);
            if (this.leadResults.length === 0) this.leadSearchError = 'Nenhum lead encontrado.';
        } catch (err) {
            this.leadSearchError = err.message || 'Erro na busca.';
        } finally {
            this.leadSearching = false;
        }
    }

    async selectLead(result) {
        try {
            await window.api.summaryView.setLeadBriefing(result.briefing);
            this.briefingText = result.briefing;
            this.briefingSaved = true;
            this.briefingOpen = false;
            this.leadResults = [];
        } catch (err) {
            this.leadSearchError = err.message;
        }
    }

    async saveBriefing() {
        const textarea = this.shadowRoot.querySelector('.briefing-textarea');
        const text = textarea ? textarea.value : '';
        this.briefingText = text;
        try {
            await window.api.summaryView.setLeadBriefing(text);
            this.briefingSaved = !!text.trim();
            this.briefingOpen = false;
        } catch (err) {
            console.error('[SummaryView] Failed to save briefing:', err);
        }
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        if (window.api) {
            window.api.summaryView.removeAllSummaryUpdateListeners();
            window.api.summaryView.removeAllSummaryStreamListeners();
            window.api.summaryView.removeAllBriefingUpdatedListeners();
        }
    }

    // Handle session reset from parent
    resetAnalysis() {
        this.structuredData = {
            summary: [],
            topic: { header: '', bullets: [] },
            actions: [],
            followUps: [],
        };
        this.requestUpdate();
    }

    async loadLibraries() {
        try {
            if (!window.marked) {
                await this.loadScript('../../../assets/marked-4.3.0.min.js');
            }

            if (!window.hljs) {
                await this.loadScript('../../../assets/highlight-11.9.0.min.js');
            }

            if (!window.DOMPurify) {
                await this.loadScript('../../../assets/dompurify-3.0.7.min.js');
            }

            this.marked = window.marked;
            this.hljs = window.hljs;
            this.DOMPurify = window.DOMPurify;

            if (this.marked && this.hljs) {
                this.marked.setOptions({
                    highlight: (code, lang) => {
                        if (lang && this.hljs.getLanguage(lang)) {
                            try {
                                return this.hljs.highlight(code, { language: lang }).value;
                            } catch (err) {
                                console.warn('Highlight error:', err);
                            }
                        }
                        try {
                            return this.hljs.highlightAuto(code).value;
                        } catch (err) {
                            console.warn('Auto highlight error:', err);
                        }
                        return code;
                    },
                    breaks: true,
                    gfm: true,
                    pedantic: false,
                    smartypants: false,
                    xhtml: false,
                });

                this.isLibrariesLoaded = true;
                console.log('Markdown libraries loaded successfully');
            }

            if (this.DOMPurify) {
                this.isDOMPurifyLoaded = true;
                console.log('DOMPurify loaded successfully in SummaryView');
            }
        } catch (error) {
            console.error('Failed to load libraries:', error);
        }
    }

    loadScript(src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    parseMarkdown(text) {
        if (!text) return '';

        if (!this.isLibrariesLoaded || !this.marked) {
            return text;
        }

        try {
            return this.marked(text);
        } catch (error) {
            console.error('Markdown parsing error:', error);
            return text;
        }
    }

    handleMarkdownClick(originalText) {
        this.handleRequestClick(originalText);
    }

    renderMarkdownContent() {
        if (!this.isLibrariesLoaded || !this.marked) {
            return;
        }

        const markdownElements = this.shadowRoot.querySelectorAll('[data-markdown-id]');
        markdownElements.forEach(element => {
            const originalText = element.getAttribute('data-original-text');
            if (originalText) {
                try {
                    let parsedHTML = this.parseMarkdown(originalText);

                    if (this.isDOMPurifyLoaded && this.DOMPurify) {
                        parsedHTML = this.DOMPurify.sanitize(parsedHTML);

                        if (this.DOMPurify.removed && this.DOMPurify.removed.length > 0) {
                            console.warn('Unsafe content detected in insights, showing plain text');
                            element.textContent = '⚠️ ' + originalText;
                            return;
                        }
                    }

                    element.innerHTML = parsedHTML;
                } catch (error) {
                    console.error('Error rendering markdown for element:', error);
                    element.textContent = originalText;
                }
            }
        });
    }

    async handleRequestClick(requestText) {
        console.log('🔥 Analysis request clicked:', requestText);

        if (window.api) {
            try {
                const result = await window.api.summaryView.sendQuestionFromSummary(requestText);

                if (result.success) {
                    console.log('✅ Question sent to AskView successfully');
                } else {
                    console.error('❌ Failed to send question to AskView:', result.error);
                }
            } catch (error) {
                console.error('❌ Error in handleRequestClick:', error);
            }
        }
    }

    getSummaryText() {
        const data = this.structuredData || { summary: [], topic: { header: '', bullets: [] }, actions: [] };
        let sections = [];

        if (data.summary && data.summary.length > 0) {
            sections.push(`Current Summary:\n${data.summary.map(s => `• ${s}`).join('\n')}`);
        }

        if (data.topic && data.topic.header && data.topic.bullets.length > 0) {
            sections.push(`\n${data.topic.header}:\n${data.topic.bullets.map(b => `• ${b}`).join('\n')}`);
        }

        if (data.actions && data.actions.length > 0) {
            sections.push(`\nActions:\n${data.actions.map(a => `▸ ${a}`).join('\n')}`);
        }

        if (data.followUps && data.followUps.length > 0) {
            sections.push(`\nFollow-Ups:\n${data.followUps.map(f => `▸ ${f}`).join('\n')}`);
        }

        return sections.join('\n\n').trim();
    }

    updated(changedProperties) {
        super.updated(changedProperties);
        this.renderMarkdownContent();
    }

    render() {
        if (!this.isVisible) {
            return html`<div style="display: none;"></div>`;
        }

        const data = this.structuredData || { suggestion: '' };

        return html`
            <div class="insights-container">
                <div class="briefing-section">
                    <div class="briefing-toggle" @click=${() => (this.briefingOpen = !this.briefingOpen)}>
                        <span>Briefing do lead</span>
                        <span class="briefing-status">${this.briefingSaved ? '● carregado' : this.briefingOpen ? '▲' : '▼ colar'}</span>
                    </div>
                    ${this.briefingOpen
                        ? html`
                              <div class="lead-search-row">
                                  <input
                                      class="lead-search-input"
                                      type="text"
                                      placeholder="Buscar lead por nome, empresa ou e-mail…"
                                      @keydown=${e => { if (e.key === 'Enter') this.searchLead(); }}
                                  />
                                  <button class="briefing-save" ?disabled=${this.leadSearching} @click=${() => this.searchLead()}>
                                      ${this.leadSearching ? '…' : 'Buscar'}
                                  </button>
                              </div>
                              ${this.leadSearchError
                                  ? html`<div class="lead-search-error">${this.leadSearchError}</div>`
                                  : ''}
                              ${this.leadResults.map(
                                  r => html`
                                      <div class="lead-result" @click=${() => this.selectLead(r)}>${r.label}</div>
                                  `
                              )}
                              <textarea
                                  class="briefing-textarea"
                                  placeholder="…ou cole aqui o card de briefing do lead manualmente."
                                  .value=${this.briefingText}
                              ></textarea>
                              <button class="briefing-save" @click=${() => this.saveBriefing()}>Salvar briefing</button>
                          `
                        : ''}
                </div>
                ${this.isStreaming
                    ? html`
                          <insights-title>Sugestão</insights-title>
                          <div class="suggestion-current streaming">${this.streamingText}<span class="suggestion-cursor"></span></div>
                      `
                    : data.suggestion
                      ? html`
                            <insights-title>Sugestão ${this.copied ? html`<span class="copied-badge">copiado ✓</span>` : ''}</insights-title>
                            <div class="suggestion-current" title="Clique para copiar" @click=${() => this.copySuggestion(data.suggestion)}>
                                ${data.suggestion}
                            </div>
                        `
                      : html`<div class="empty-state">Aguardando a fala do lead…</div>`}
                ${this.suggestionHistory.length > 0
                    ? html`
                          <insights-title>Sugestões anteriores</insights-title>
                          ${this.suggestionHistory.map(
                              s => html`
                                  <div class="suggestion-history-item" title="Clique para copiar" @click=${() => this.copySuggestion(s)}>${s}</div>
                              `
                          )}
                      `
                    : ''}
            </div>
        `;
    }
}

customElements.define('summary-view', SummaryView); 