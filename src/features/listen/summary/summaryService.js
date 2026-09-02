const { BrowserWindow } = require('electron');
const { getSystemPrompt } = require('../../common/prompts/promptBuilder.js');
const { createStreamingLLM } = require('../../common/ai/factory');
const sessionRepository = require('../../common/repositories/session');
const summaryRepository = require('./repositories');
const modelStateService = require('../../common/services/modelStateService');

// Estabilidade das sugestões ao vivo (feedback do closer em call real).
// Calibráveis — a intenção é ajustar estes valores com uso real.
//
// Tempo mínimo que uma sugestão fica na tela antes de poder ser substituída, contado a
// partir do ÚLTIMO token (fim do stream), que é quando ela ficou legível por inteiro.
// Substitui o antigo SUGGESTION_COOLDOWN_MS de 8s: um relógio só. 2 frases em pt-BR dão
// ~25-35 palavras, e o closer lê sob carga de call (falando e ouvindo ao mesmo tempo),
// a ~2,5-3 palavras/s — daí os 10s.
const MIN_READ_MS = 10000;
// Segurar análise enquanto o closer está falando (ele não lê nada nessa hora).
const ME_SPEAKING_HOLD_MS = 2500;
// Silêncio mínimo do lead antes de gerar. Com o fechamento de turno agora dirigido pelos
// eventos de fim de enunciado do provedor (speech_final / UtteranceEnd no sttService),
// este hold deixou de carregar a detecção e virou só uma folga — mas passou a ser de
// fato alimentado durante a fala, inclusive pelos resultados parciais.
const THEM_QUIET_HOLD_MS = 800;

class SummaryService {
    constructor() {
        this.previousAnalysisResult = null;
        this.analysisHistory = [];
        this.conversationHistory = [];
        this.currentSessionId = null;
        this.analysisInFlight = false;
        this.analysisPending = false;
        this.lastSuggestionAt = 0;
        this.lastMeActivityAt = 0;
        this.lastThemActivityAt = 0;
        this._deferTimer = null;

        // Callbacks
        this.onAnalysisComplete = null;
        this.onStatusUpdate = null;
    }

    /** Chamado pelo STT sempre que chega fala do closer (canal "Me"). */
    notifyMeActivity() {
        this.lastMeActivityAt = Date.now();
    }

    /** Chamado pelo STT sempre que chega fala do lead (canal "Them"). */
    notifyThemActivity() {
        this.lastThemActivityAt = Date.now();
    }

    setCallbacks({ onAnalysisComplete, onStatusUpdate }) {
        this.onAnalysisComplete = onAnalysisComplete;
        this.onStatusUpdate = onStatusUpdate;
    }

    setSessionId(sessionId) {
        this.currentSessionId = sessionId;
    }

    sendToRenderer(channel, data) {
        const { windowPool } = require('../../../window/windowManager');
        const listenWindow = windowPool?.get('listen');
        
        if (listenWindow && !listenWindow.isDestroyed()) {
            listenWindow.webContents.send(channel, data);
        }
    }

    addConversationTurn(speaker, text) {
        const conversationText = `${speaker.toLowerCase()}: ${text.trim()}`;
        this.conversationHistory.push(conversationText);
        console.log(`💬 Added conversation text: ${conversationText}`);
        console.log(`📈 Total conversation history: ${this.conversationHistory.length} texts`);

        // Trigger analysis if needed
        this.triggerAnalysisIfNeeded(speaker);
    }

    getConversationHistory() {
        return this.conversationHistory;
    }

    resetConversationHistory() {
        this.conversationHistory = [];
        this.previousAnalysisResult = null;
        this.analysisHistory = [];
        console.log('🔄 Conversation history and analysis state reset');
    }

    /**
     * Converts conversation history into text to include in the prompt.
     * @param {Array<string>} conversationTexts - Array of conversation texts ["me: ~~~", "them: ~~~", ...]
     * @param {number} maxTurns - Maximum number of recent turns to include
     * @returns {string} - Formatted conversation string for the prompt
     */
    formatConversationForPrompt(conversationTexts, maxTurns = 30) {
        if (conversationTexts.length === 0) return '';
        return conversationTexts.slice(-maxTurns).join('\n');
    }

    /**
     * Lê um Response SSE (formato OpenAI, padrão de todos os providers do factory),
     * emite tokens incrementais para a UI e retorna o texto completo.
     */
    async _readSseStream(response) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullText = '';
        let firstTokenLogged = false;
        // Retém os primeiros caracteres: se a resposta for "MANTER" (sugestão
        // anterior continua válida), nada é enviado à tela — zero ruído.
        let emitindo = false;
        let suprimido = false;
        const HOLD_CHARS = 10;

        const emitir = (done) => {
            if (suprimido) return;
            if (!emitindo) {
                if (fullText.trim().toUpperCase().startsWith('MANTER')) {
                    suprimido = true;
                    return;
                }
                if (fullText.length < HOLD_CHARS && !done) return;
                emitindo = true;
            }
            this.sendToRenderer('summary-stream', { text: fullText, done });
        };

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const lines = decoder.decode(value).split('\n').filter(line => line.trim() !== '');
            for (const line of lines) {
                if (!line.startsWith('data: ')) continue;
                const data = line.substring(6);
                if (data === '[DONE]') {
                    emitir(true);
                    return fullText;
                }
                try {
                    const token = JSON.parse(data).choices[0]?.delta?.content || '';
                    if (token) {
                        if (!firstTokenLogged) {
                            firstTokenLogged = true;
                            if (this._latencyT0) {
                                console.log(`[Latency] first-token +${Date.now() - this._latencyT0}ms (turno→1º token na tela)`);
                            }
                        }
                        fullText += token;
                        emitir(false);
                    }
                } catch (_) {
                    // linha SSE parcial/não-JSON — ignora
                }
            }
        }

        emitir(true);
        return fullText;
    }

    async makeOutlineAndRequests(conversationTexts, maxTurns = 30) {
        console.log(`🔍 makeOutlineAndRequests called - conversationTexts: ${conversationTexts.length}`);

        if (conversationTexts.length === 0) {
            console.log('⚠️ No conversation texts available for analysis');
            return null;
        }

        const recentConversation = this.formatConversationForPrompt(conversationTexts, maxTurns);

        // System prompt estável (bom para prompt caching); a janela de conversa vai na mensagem de usuário.
        // Se houver um agente ativo (criado pelo usuário), o prompt dele substitui o playbook padrão.
        let agentPrompt = '';
        try {
            // require tardio para evitar ciclo de imports com settingsService
            const settingsService = require('../../settings/settingsService');
            const activeAgent = await settingsService.getActivePreset();
            if (activeAgent?.prompt) {
                agentPrompt = activeAgent.prompt;
                console.log(`[SummaryService] Agente ativo: "${activeAgent.title}"`);
            }
        } catch (err) {
            console.error('[SummaryService] Failed to load active agent, using default playbook:', err.message);
        }
        const systemPrompt = getSystemPrompt('v4_sales_copilot', '', false, agentPrompt);

        const lastSuggestion = this.previousAnalysisResult?.suggestion || '';
        const antiRepeat = lastSuggestion
            ? `Última sugestão dada ao closer: "${lastSuggestion}"\nSe essa sugestão AINDA é a melhor orientação para este momento da conversa, responda exatamente: MANTER\nCaso contrário, gere uma sugestão nova (não repita a mesma ideia).\n\n`
            : '';

        try {
            if (this.currentSessionId) {
                await sessionRepository.touch(this.currentSessionId);
            }

            const modelInfo = await modelStateService.getCurrentModelInfo('llm');
            if (!modelInfo || !modelInfo.apiKey) {
                throw new Error('AI model or API key is not configured.');
            }
            console.log(`🤖 Sending analysis request to ${modelInfo.provider} using model ${modelInfo.model}`);
            
            const messages = [
                {
                    role: 'system',
                    content: systemPrompt,
                },
                {
                    role: 'user',
                    content: `${antiRepeat}Conversa recente (me = closer, them = lead):
${recentConversation}

Gere agora a sugestão para o closer (máximo 2 frases, pt-BR).`,
                },
            ];

            console.log('🤖 Sending analysis request to AI...');

            const llm = createStreamingLLM(modelInfo.provider, {
                apiKey: modelInfo.apiKey,
                model: modelInfo.model,
                temperature: 0.7,
                maxTokens: 1024,
            });

            // Streaming: tokens chegam à UI conforme são gerados ('summary-stream'),
            // e o texto completo segue para o parser/persistência ao final.
            const response = await llm.streamChat(messages);
            const responseText = await this._readSseStream(response);
            console.log(`✅ Suggestion received: ${responseText}`);

            const suggestion = responseText.trim();

            // "MANTER" = a sugestão anterior continua valendo; não mexe na tela.
            if (suggestion.toUpperCase().startsWith('MANTER')) {
                console.log('🟰 Sugestão mantida (MANTER) — tela intocada');
                return null;
            }

            // A resposta é a sugestão em texto puro (máx. 2 frases) — sem parser.
            // Shape compatível com a SummaryView atual até a tarefa 1.10 adaptar a UI.
            const structuredData = {
                suggestion,
                summary: suggestion ? [suggestion] : [],
                topic: { header: 'Sugestão', bullets: [] },
                actions: [],
                followUps: [],
            };

            if (this.currentSessionId && suggestion) {
                try {
                    summaryRepository.saveSummary({
                        sessionId: this.currentSessionId,
                        text: suggestion,
                        tldr: suggestion,
                        bullet_json: '[]',
                        action_json: '[]',
                        model: modelInfo.model
                    });
                } catch (err) {
                    console.error('[DB] Failed to save summary:', err);
                }
            }

            // 분석 결과 저장
            this.previousAnalysisResult = structuredData;
            this.analysisHistory.push({
                timestamp: Date.now(),
                data: structuredData,
                conversationLength: conversationTexts.length,
            });

            if (this.analysisHistory.length > 10) {
                this.analysisHistory.shift();
            }

            return structuredData;
        } catch (error) {
            console.error('❌ Error during analysis generation:', error.message);
            return this.previousAnalysisResult; // 에러 시 이전 결과 반환
        }
    }

    /**
     * Dispara a análise a cada turno finalizado do lead ("Them"), com estabilidade:
     * - uma análise por vez (rajadas do lead são coalescidas numa re-análise);
     * - cooldown mínimo entre sugestões exibidas;
     * - se o closer está falando, a análise espera ele terminar.
     */
    triggerAnalysisIfNeeded(speaker) {
        if ((speaker || '').toLowerCase() !== 'them') return;
        this.analysisPending = true;
        this._maybeRunAnalysis();
    }

    _maybeRunAnalysis() {
        if (this.analysisInFlight || !this.analysisPending) return;

        const now = Date.now();
        const cooldownLeft = this.lastSuggestionAt + MIN_READ_MS - now;
        const meHoldLeft = this.lastMeActivityAt + ME_SPEAKING_HOLD_MS - now;
        const themHoldLeft = this.lastThemActivityAt + THEM_QUIET_HOLD_MS - now;
        const waitMs = Math.max(cooldownLeft, meHoldLeft, themHoldLeft, 0);

        if (waitMs > 0) {
            if (!this._deferTimer) {
                const motivo = themHoldLeft >= Math.max(cooldownLeft, meHoldLeft) ? 'lead ainda falando'
                    : meHoldLeft > cooldownLeft ? 'closer falando' : 'sugestão atual ainda sendo lida';
                console.log(`[SummaryService] Sugestão adiada ${waitMs}ms (${motivo})`);
                this._deferTimer = setTimeout(() => {
                    this._deferTimer = null;
                    this._maybeRunAnalysis();
                }, waitMs + 50);
            }
            return;
        }

        this.analysisPending = false;
        this.analysisInFlight = true;
        (async () => {
            try {
                this._latencyT0 = Date.now();
                console.log(`Triggering analysis - ${this.conversationHistory.length} conversation texts accumulated`);

                const data = await this.makeOutlineAndRequests(this.conversationHistory);
                if (this._latencyT0) {
                    console.log(`[Latency] suggestion-complete +${Date.now() - this._latencyT0}ms`);
                }
                if (data) {
                    // Fim do stream = último token na tela. O relógio de leitura da
                    // sugestão nova começa aqui. Num MANTER não passamos por este ponto,
                    // e é o correto: a sugestão em tela é a mesma de antes e o relógio
                    // dela já está correndo — reiniciar seria dar tempo em dobro.
                    this.lastSuggestionAt = Date.now();
                    console.log('Sending structured data to renderer');
                    this.sendToRenderer('summary-update', data);

                    // Notify callback
                    if (this.onAnalysisComplete) {
                        this.onAnalysisComplete(data);
                    }
                } else {
                    console.log('No analysis data returned (ou MANTER)');
                }
            } finally {
                this.analysisInFlight = false;
                // Rajada acumulada durante a análise: reavalia respeitando o cooldown.
                this._maybeRunAnalysis();
            }
        })();
    }

    getCurrentAnalysisData() {
        return {
            previousResult: this.previousAnalysisResult,
            history: this.analysisHistory,
            conversationLength: this.conversationHistory.length,
        };
    }
}

module.exports = SummaryService; 