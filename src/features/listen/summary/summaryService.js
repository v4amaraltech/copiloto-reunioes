const { BrowserWindow } = require('electron');
const { getSystemPrompt } = require('../../common/prompts/promptBuilder.js');
const { createStreamingLLM } = require('../../common/ai/factory');
const sessionRepository = require('../../common/repositories/session');
const summaryRepository = require('./repositories');
const modelStateService = require('../../common/services/modelStateService');

class SummaryService {
    constructor() {
        this.previousAnalysisResult = null;
        this.analysisHistory = [];
        this.conversationHistory = [];
        this.currentSessionId = null;
        this.analysisInFlight = false;
        this.analysisPending = false;
        this.leadBriefing = '';

        // Callbacks
        this.onAnalysisComplete = null;
        this.onStatusUpdate = null;
    }

    setCallbacks({ onAnalysisComplete, onStatusUpdate }) {
        this.onAnalysisComplete = onAnalysisComplete;
        this.onStatusUpdate = onStatusUpdate;
    }

    setSessionId(sessionId) {
        this.currentSessionId = sessionId;
    }

    /**
     * Briefing do lead da call atual (Sprint 1: colado manualmente na UI;
     * Sprint 2: preenchido automaticamente via Calendar → Enriquece AI).
     */
    setLeadBriefing(text) {
        this.leadBriefing = (text || '').trim();
        console.log(`[SummaryService] Lead briefing ${this.leadBriefing ? `set (${this.leadBriefing.length} chars)` : 'cleared'}`);
    }

    getLeadBriefing() {
        return this.leadBriefing;
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

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const lines = decoder.decode(value).split('\n').filter(line => line.trim() !== '');
            for (const line of lines) {
                if (!line.startsWith('data: ')) continue;
                const data = line.substring(6);
                if (data === '[DONE]') {
                    this.sendToRenderer('summary-stream', { text: fullText, done: true });
                    return fullText;
                }
                try {
                    const token = JSON.parse(data).choices[0]?.delta?.content || '';
                    if (token) {
                        fullText += token;
                        this.sendToRenderer('summary-stream', { text: fullText, done: false });
                    }
                } catch (_) {
                    // linha SSE parcial/não-JSON — ignora
                }
            }
        }

        this.sendToRenderer('summary-stream', { text: fullText, done: true });
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
        // O briefing do lead entra na seção "User-provided context" do system prompt.
        const systemPrompt = getSystemPrompt('v4_sales_copilot', this.leadBriefing, false);

        const lastSuggestion = this.previousAnalysisResult?.suggestion || '';
        const antiRepeat = lastSuggestion
            ? `Última sugestão dada ao closer (não repita a mesma ideia): "${lastSuggestion}"\n\n`
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
     * Dispara a análise a cada turno finalizado do lead ("Them").
     * Uma análise por vez: se o lead fala em rajada, as chamadas extras são
     * coalescidas numa única re-análise ao fim da atual (sempre com o histórico mais recente).
     */
    async triggerAnalysisIfNeeded(speaker) {
        if ((speaker || '').toLowerCase() !== 'them') return;

        if (this.analysisInFlight) {
            this.analysisPending = true;
            return;
        }

        this.analysisInFlight = true;
        try {
            do {
                this.analysisPending = false;
                console.log(`Triggering analysis - ${this.conversationHistory.length} conversation texts accumulated`);

                const data = await this.makeOutlineAndRequests(this.conversationHistory);
                if (data) {
                    console.log('Sending structured data to renderer');
                    this.sendToRenderer('summary-update', data);

                    // Notify callback
                    if (this.onAnalysisComplete) {
                        this.onAnalysisComplete(data);
                    }
                } else {
                    console.log('No analysis data returned');
                }
            } while (this.analysisPending);
        } finally {
            this.analysisInFlight = false;
        }
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