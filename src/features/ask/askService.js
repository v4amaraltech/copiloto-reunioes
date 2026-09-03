const { BrowserWindow } = require('electron');
const { createStreamingLLM } = require('../common/ai/factory');
// Lazy require helper to avoid circular dependency issues
const getWindowManager = () => require('../../window/windowManager');
const internalBridge = require('../../bridge/internalBridge');

const getWindowPool = () => {
    try {
        return getWindowManager().windowPool;
    } catch {
        return null;
    }
};

const sessionRepository = require('../common/repositories/session');
const sttRepository = require('../listen/stt/repositories');
const askRepository = require('./repositories');
const { getSystemPrompt } = require('../common/prompts/promptBuilder');
const path = require('node:path');
const fs = require('node:fs');
const os = require('os');
const util = require('util');
const execFile = util.promisify(require('child_process').execFile);
const { desktopCapturer } = require('electron');
const modelStateService = require('../common/services/modelStateService');

// Try to load sharp, but don't fail if it's not available
let sharp;
try {
    sharp = require('sharp');
    console.log('[AskService] Sharp module loaded successfully');
} catch (error) {
    console.warn('[AskService] Sharp module not available:', error.message);
    console.warn('[AskService] Screenshot functionality will work with reduced image processing capabilities');
    sharp = null;
}
let lastScreenshot = null;

// Conversa com reunião passada: teto de transcrição enviada por pergunta. ~120k chars
// (≈34k tokens em pt-BR) cobre com folga a maior call medida — 31 min / 32k chars
// (docs/VINCULO-REUNIAO.md, B.3). Acima disso mandamos começo + fim, com aviso.
const MAX_TRANSCRIPT_CHARS = 120000;
// Turnos anteriores da conversa reenviados como contexto.
const HISTORY_TURNS = 10;

// Política V4 Amaral: além do áudio, o Perguntar envia uma captura da tela
// como contexto (reativado a pedido — antes era áudio-somente).
const SCREENSHOT_ENABLED = true;

async function captureScreenshot(options = {}) {
    if (!SCREENSHOT_ENABLED) {
        return { success: false, error: 'Screenshot desativado (política áudio-somente)' };
    }
    if (process.platform === 'darwin') {
        try {
            const tempPath = path.join(os.tmpdir(), `screenshot-${Date.now()}.jpg`);

            await execFile('screencapture', ['-x', '-t', 'jpg', tempPath]);

            const imageBuffer = await fs.promises.readFile(tempPath);
            await fs.promises.unlink(tempPath);

            if (sharp) {
                try {
                    // Try using sharp for optimal image processing
                    const resizedBuffer = await sharp(imageBuffer)
                        .resize({ height: 384 })
                        .jpeg({ quality: 80 })
                        .toBuffer();

                    const base64 = resizedBuffer.toString('base64');
                    const metadata = await sharp(resizedBuffer).metadata();

                    lastScreenshot = {
                        base64,
                        width: metadata.width,
                        height: metadata.height,
                        timestamp: Date.now(),
                    };

                    return { success: true, base64, width: metadata.width, height: metadata.height };
                } catch (sharpError) {
                    console.warn('Sharp module failed, falling back to basic image processing:', sharpError.message);
                }
            }
            
            // Fallback: Return the original image without resizing
            console.log('[AskService] Using fallback image processing (no resize/compression)');
            const base64 = imageBuffer.toString('base64');
            
            lastScreenshot = {
                base64,
                width: null, // We don't have metadata without sharp
                height: null,
                timestamp: Date.now(),
            };

            return { success: true, base64, width: null, height: null };
        } catch (error) {
            console.error('Failed to capture screenshot:', error);
            return { success: false, error: error.message };
        }
    }

    try {
        const sources = await desktopCapturer.getSources({
            types: ['screen'],
            thumbnailSize: {
                width: 1920,
                height: 1080,
            },
        });

        if (sources.length === 0) {
            throw new Error('No screen sources available');
        }
        const source = sources[0];
        const buffer = source.thumbnail.toJPEG(70);
        const base64 = buffer.toString('base64');
        const size = source.thumbnail.getSize();

        return {
            success: true,
            base64,
            width: size.width,
            height: size.height,
        };
    } catch (error) {
        console.error('Failed to capture screenshot using desktopCapturer:', error);
        return {
            success: false,
            error: error.message,
        };
    }
}

/**
 * @class
 * @description
 */
class AskService {
    constructor() {
        this.abortController = null;
        // Um controller por sessão: a conversa sobre uma reunião passada é independente
        // do Ask ao vivo e das conversas sobre outras reuniões.
        this.sessionAbortControllers = new Map();
        this.state = {
            isVisible: false,
            isLoading: false,
            isStreaming: false,
            currentQuestion: '',
            currentResponse: '',
            showTextInput: true,
        };
        console.log('[AskService] Service instance created.');
    }

    _broadcastState() {
        const askWindow = getWindowPool()?.get('ask');
        if (askWindow && !askWindow.isDestroyed()) {
            askWindow.webContents.send('ask:stateUpdate', this.state);
        }
    }

    async toggleAskButton(inputScreenOnly = false) {
        const askWindow = getWindowPool()?.get('ask');

        let shouldSendScreenOnly = false;
        if (inputScreenOnly && this.state.showTextInput && askWindow && askWindow.isVisible()) {
            shouldSendScreenOnly = true;
            await this.sendMessage('', []);
            return;
        }

        const hasContent = this.state.isLoading || this.state.isStreaming || (this.state.currentResponse && this.state.currentResponse.length > 0);

        if (askWindow && askWindow.isVisible() && hasContent) {
            this.state.showTextInput = !this.state.showTextInput;
            this._broadcastState();
        } else {
            if (askWindow && askWindow.isVisible()) {
                internalBridge.emit('window:requestVisibility', { name: 'ask', visible: false });
                this.state.isVisible = false;
            } else {
                console.log('[AskService] Showing hidden Ask window');
                internalBridge.emit('window:requestVisibility', { name: 'ask', visible: true });
                this.state.isVisible = true;
            }
            if (this.state.isVisible) {
                this.state.showTextInput = true;
                this._broadcastState();
            }
        }
    }

    async closeAskWindow () {
            if (this.abortController) {
                this.abortController.abort('Window closed by user');
                this.abortController = null;
            }
    
            this.state = {
                isVisible      : false,
                isLoading      : false,
                isStreaming    : false,
                currentQuestion: '',
                currentResponse: '',
                showTextInput  : true,
            };
            this._broadcastState();
    
            internalBridge.emit('window:requestVisibility', { name: 'ask', visible: false });
    
            return { success: true };
        }
    

    /**
     * 
     * @param {string[]} conversationTexts
     * @returns {string}
     * @private
     */
    _formatConversationForPrompt(conversationTexts) {
        if (!conversationTexts || conversationTexts.length === 0) {
            return 'No conversation history available.';
        }
        return conversationTexts.slice(-30).join('\n');
    }

    /**
     * 
     * @param {string} userPrompt
     * @returns {Promise<{success: boolean, response?: string, error?: string}>}
     */
    async sendMessage(userPrompt, conversationHistoryRaw=[]) {
        internalBridge.emit('window:requestVisibility', { name: 'ask', visible: true });
        this.state = {
            ...this.state,
            isLoading: true,
            isStreaming: false,
            currentQuestion: userPrompt,
            currentResponse: '',
            showTextInput: false,
        };
        this._broadcastState();

        if (this.abortController) {
            this.abortController.abort('New request received.');
        }
        this.abortController = new AbortController();
        const { signal } = this.abortController;


        let sessionId;

        try {
            console.log(`[AskService] 🤖 Processing message: ${userPrompt.substring(0, 50)}...`);

            sessionId = await sessionRepository.getOrCreateActive('ask');
            await askRepository.addAiMessage({ sessionId, role: 'user', content: userPrompt.trim() });
            console.log(`[AskService] DB: Saved user prompt to session ${sessionId}`);
            
            const modelInfo = await modelStateService.getCurrentModelInfo('llm');
            if (!modelInfo || !modelInfo.apiKey) {
                throw new Error('AI model or API key not configured.');
            }
            console.log(`[AskService] Using model: ${modelInfo.model} for provider: ${modelInfo.provider}`);

            const screenshotResult = await captureScreenshot({ quality: 'medium' });
            const screenshotBase64 = screenshotResult.success ? screenshotResult.base64 : null;

            const conversationHistory = this._formatConversationForPrompt(conversationHistoryRaw);

            // Agente ativo entra como contexto adicional na resposta do Ask.
            // (A conversa recente vai na mensagem de usuário — mantém o system
            // estável para o prompt caching.)
            let agentContext = '';
            try {
                const activeAgent = await require('../settings/settingsService').getActivePreset();
                if (activeAgent?.prompt) {
                    agentContext = `Playbook do agente ativo ("${activeAgent.title}"), escolhido pelo usuário — responda alinhado a ele:\n${activeAgent.prompt}\n\n`;
                }
            } catch (_) { /* sem agente ativo */ }

            const systemPrompt = getSystemPrompt('v4_ask', agentContext, false);

            const userText = conversationHistory && conversationHistory !== 'No conversation history available.'
                ? `Conversa recente (me = closer, them = lead):\n${conversationHistory}\n\nPergunta do closer: ${userPrompt.trim()}`
                : `Pergunta do closer: ${userPrompt.trim()}`;

            const messages = [
                { role: 'system', content: systemPrompt },
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: userText },
                    ],
                },
            ];

            if (screenshotBase64) {
                messages[1].content.push({
                    type: 'image_url',
                    image_url: { url: `data:image/jpeg;base64,${screenshotBase64}` },
                });
            }
            
            const streamingLLM = createStreamingLLM(modelInfo.provider, {
                apiKey: modelInfo.apiKey,
                model: modelInfo.model,
                temperature: 0.7,
                maxTokens: 2048,
            });

            try {
                const response = await streamingLLM.streamChat(messages);
                const askWin = getWindowPool()?.get('ask');

                if (!askWin || askWin.isDestroyed()) {
                    console.error("[AskService] Ask window is not available to send stream to.");
                    response.body.getReader().cancel();
                    return { success: false, error: 'Ask window is not available.' };
                }

                const reader = response.body.getReader();
                signal.addEventListener('abort', () => {
                    console.log(`[AskService] Aborting stream reader. Reason: ${signal.reason}`);
                    reader.cancel(signal.reason).catch(() => { /* 이미 취소된 경우의 오류는 무시 */ });
                });

                await this._processStream(reader, askWin, sessionId, signal);
                return { success: true };

            } catch (multimodalError) {
                // 멀티모달 요청이 실패했고 스크린샷이 포함되어 있다면 텍스트만으로 재시도
                if (screenshotBase64 && this._isMultimodalError(multimodalError)) {
                    console.log(`[AskService] Multimodal request failed, retrying with text-only: ${multimodalError.message}`);
                    
                    // 텍스트만으로 메시지 재구성
                    const textOnlyMessages = [
                        { role: 'system', content: systemPrompt },
                        {
                            role: 'user',
                            content: `User Request: ${userPrompt.trim()}`
                        }
                    ];

                    const fallbackResponse = await streamingLLM.streamChat(textOnlyMessages);
                    const askWin = getWindowPool()?.get('ask');

                    if (!askWin || askWin.isDestroyed()) {
                        console.error("[AskService] Ask window is not available for fallback response.");
                        fallbackResponse.body.getReader().cancel();
                        return { success: false, error: 'Ask window is not available.' };
                    }

                    const fallbackReader = fallbackResponse.body.getReader();
                    signal.addEventListener('abort', () => {
                        console.log(`[AskService] Aborting fallback stream reader. Reason: ${signal.reason}`);
                        fallbackReader.cancel(signal.reason).catch(() => {});
                    });

                    await this._processStream(fallbackReader, askWin, sessionId, signal);
                    return { success: true };
                } else {
                    // 다른 종류의 에러이거나 스크린샷이 없었다면 그대로 throw
                    throw multimodalError;
                }
            }

        } catch (error) {
            console.error('[AskService] Error during message processing:', error);
            this.state = {
                ...this.state,
                isLoading: false,
                isStreaming: false,
                showTextInput: true,
            };
            this._broadcastState();

            const askWin = getWindowPool()?.get('ask');
            if (askWin && !askWin.isDestroyed()) {
                const streamError = error.message || 'Unknown error occurred';
                askWin.webContents.send('ask-response-stream-error', { error: streamError });
            }

            return { success: false, error: error.message };
        }
    }

    /**
     * 
     * @param {ReadableStreamDefaultReader} reader
     * @param {BrowserWindow} askWin
     * @param {number} sessionId 
     * @param {AbortSignal} signal
     * @returns {Promise<void>}
     * @private
     */
    async _processStream(reader, askWin, sessionId, signal) {
        const decoder = new TextDecoder();
        let fullResponse = '';

        try {
            this.state.isLoading = false;
            this.state.isStreaming = true;
            this._broadcastState();
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value);
                const lines = chunk.split('\n').filter(line => line.trim() !== '');

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.substring(6);
                        if (data === '[DONE]') {
                            return; 
                        }
                        try {
                            const json = JSON.parse(data);
                            const token = json.choices[0]?.delta?.content || '';
                            if (token) {
                                fullResponse += token;
                                this.state.currentResponse = fullResponse;
                                this._broadcastState();
                            }
                        } catch (error) {
                        }
                    }
                }
            }
        } catch (streamError) {
            if (signal.aborted) {
                console.log(`[AskService] Stream reading was intentionally cancelled. Reason: ${signal.reason}`);
            } else {
                console.error('[AskService] Error while processing stream:', streamError);
                if (askWin && !askWin.isDestroyed()) {
                    askWin.webContents.send('ask-response-stream-error', { error: streamError.message });
                }
            }
        } finally {
            this.state.isStreaming = false;
            this.state.currentResponse = fullResponse;
            this._broadcastState();
            if (fullResponse) {
                 try {
                    await askRepository.addAiMessage({ sessionId, role: 'assistant', content: fullResponse });
                    console.log(`[AskService] DB: Saved partial or full assistant response to session ${sessionId} after stream ended.`);
                } catch(dbError) {
                    console.error("[AskService] DB: Failed to save assistant response after stream ended:", dbError);
                }
            }
        }
    }

    // ---------------------------------------------------------------------------
    // Conversa com uma reunião JÁ ENCERRADA (fatia 2 de docs/VINCULO-REUNIAO.md).
    //
    // Diferenças em relação ao Ask ao vivo (sendMessage):
    //   - não cria sessão 'ask': grava as ai_messages na PRÓPRIA sessão da reunião;
    //   - não tira screenshot (a tela de agora não tem relação com a call de ontem);
    //   - carrega a transcrição INTEIRA do banco, não a janela de 30 falas do renderer;
    //   - o stream vai para o canal 'sessions:ask-stream', sempre com o sessionId.
    // ---------------------------------------------------------------------------

    /** Emite um evento de stream da conversa de sessão para todas as janelas abertas. */
    _emitSessionStream(payload) {
        const pool = getWindowPool();
        const janelas = pool ? Array.from(pool.values()) : [];
        for (const janela of janelas) {
            if (janela && !janela.isDestroyed()) {
                janela.webContents.send('sessions:ask-stream', payload);
            }
        }
    }

    /**
     * Formata as falas como "speaker: texto" e, se passar do teto, manda começo e fim
     * com um aviso no meio. Acima de ~120k chars (≈34k tokens em pt-BR) não vale
     * reenviar tudo a cada pergunta — e a doc mede que nenhuma call real chega perto.
     */
    _formatTranscriptForPrompt(transcripts, maxChars = MAX_TRANSCRIPT_CHARS) {
        const linhas = transcripts
            .map(t => `${(t.speaker || 'fala').toLowerCase()}: ${(t.text || '').trim()}`)
            .filter(linha => linha.length > 6);

        const texto = linhas.join('\n');
        if (texto.length <= maxChars) {
            return { texto, truncada: false };
        }

        const metade = Math.floor(maxChars / 2);
        const inicio = texto.slice(0, metade);
        const fim = texto.slice(-metade);
        const cortados = texto.length - inicio.length - fim.length;
        const aviso = `\n\n[... ${cortados} caracteres do MEIO desta transcrição foram omitidos por limite de tamanho. Você tem o começo e o fim da reunião, mas não o trecho central ...]\n\n`;

        return { texto: inicio + aviso + fim, truncada: true, cortados };
    }

    /** Contexto imutável da reunião: metadados + transcrição. Vai dentro do system prompt. */
    _buildSessionContext(session, transcriptBlock) {
        const formatarData = (ts) => {
            if (!ts) return 'data desconhecida';
            return new Date(ts * 1000).toLocaleString('pt-BR', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit',
            });
        };

        const duracao = session.started_at && session.ended_at
            ? `${Math.max(1, Math.round((session.ended_at - session.started_at) / 60))} minutos`
            : 'duração desconhecida';

        const cabecalho = [
            `REUNIÃO (já encerrada)`,
            `Título: ${session.title || 'sem título'}`,
            `Quando: ${formatarData(session.started_at)}`,
            `Duração: ${duracao}`,
            transcriptBlock.truncada ? `Atenção: a transcrição abaixo está TRUNCADA no meio.` : null,
        ].filter(Boolean).join('\n');

        return `${cabecalho}\n\nTRANSCRIÇÃO COMPLETA (me = closer da V4, them = lead):\n-----\n${transcriptBlock.texto}\n-----`;
    }

    /** Sessão + transcrição do banco local (call do próprio usuário). @private */
    async _carregarSessaoLocal(sessionId) {
        const session = await sessionRepository.getById(sessionId);
        if (!session) {
            throw new Error('Esta reunião não foi encontrada no histórico.');
        }
        const transcripts = (await sttRepository.getAllTranscriptsBySessionId(sessionId)) || [];
        if (transcripts.length === 0) {
            throw new Error('Esta reunião não tem transcrição gravada, então não há o que consultar.');
        }
        return { session, transcripts, ownerUid: session.uid || null };
    }

    /** Sessão + transcrição da nuvem (call de um closer, aberta pelo gestor). @private */
    async _carregarSessaoDaNuvem(sessionId) {
        const v4TeamService = require('../common/services/v4TeamService');

        const session = await v4TeamService.getCloudSession(sessionId);
        if (!session) {
            throw new Error('Esta reunião do time não foi encontrada, ou você não tem acesso a ela.');
        }

        const r = await v4TeamService.teamTranscripts(sessionId);
        if (!r.success) {
            throw new Error(r.error || 'Não foi possível carregar a transcrição desta reunião.');
        }

        return { session, transcripts: r.transcripts, ownerUid: session.uid || null };
    }

    /** Histórico da conversa, do banco local ou da nuvem. @private */
    async _historicoDaSessao(sessionId, fonte) {
        if (fonte === 'cloud') {
            const v4TeamService = require('../common/services/v4TeamService');
            const r = await v4TeamService.cloudAiMessages(sessionId);
            return r.success ? r.messages : [];
        }
        return (await askRepository.getAllAiMessagesBySessionId(sessionId)) || [];
    }

    /**
     * Grava uma mensagem da conversa. Na nuvem ela fica na sessão do closer, com o
     * gestor administrando o documento e o closer lendo. @private
     */
    async _gravarMensagem({ sessionId, fonte, ownerUid, role, content, model }) {
        if (fonte === 'cloud') {
            const v4TeamService = require('../common/services/v4TeamService');
            const r = await v4TeamService.addCloudAiMessage({ sessionId, ownerUid, role, content, model });
            if (!r.success) throw new Error(r.error || 'Não foi possível gravar a conversa na nuvem.');
            return r;
        }
        return await askRepository.addAiMessage({ sessionId, role, content, model });
    }

    /**
     * Responde uma pergunta sobre uma reunião passada.
     *
     * @param {{sessionId: string, question: string}} params
     * @returns {Promise<{success: boolean, response?: string, error?: string}>}
     */
    async askAboutSession({ sessionId, question, source = 'local' } = {}) {
        const pergunta = (question || '').trim();
        const fonte = source === 'cloud' ? 'cloud' : 'local';

        if (!sessionId) {
            return { success: false, error: 'Sessão não informada.' };
        }
        if (!pergunta) {
            return { success: false, error: 'Digite uma pergunta sobre esta reunião.' };
        }

        // Uma pergunta por sessão: a nova cancela o stream anterior da MESMA sessão,
        // sem tocar no Ask ao vivo nem nas conversas de outras sessões.
        const anterior = this.sessionAbortControllers.get(sessionId);
        if (anterior) anterior.abort('Nova pergunta sobre a mesma sessão.');
        const controller = new AbortController();
        this.sessionAbortControllers.set(sessionId, controller);
        const { signal } = controller;

        try {
            // fonte 'local' = call do próprio usuário, no SQLite.
            // fonte 'cloud' = call de um closer do time, lida do Appwrite pelo gestor
            //                 (a permissão do documento é quem autoriza — docs/TIMES.md).
            const { session, transcripts, ownerUid } = fonte === 'cloud'
                ? await this._carregarSessaoDaNuvem(sessionId)
                : await this._carregarSessaoLocal(sessionId);

            const modelInfo = await modelStateService.getCurrentModelInfo('llm');
            if (!modelInfo || !modelInfo.apiKey) {
                throw new Error('Nenhum modelo de IA configurado. Adicione sua chave em Configurações.');
            }

            // Histórico ANTES de gravar a pergunta nova, senão ela apareceria duplicada.
            const historico = await this._historicoDaSessao(sessionId, fonte);

            await this._gravarMensagem({ sessionId, fonte, ownerUid, role: 'user', content: pergunta });
            console.log(`[AskService] Pergunta sobre a sessão ${sessionId} gravada (fonte ${fonte}).`);

            const transcriptBlock = this._formatTranscriptForPrompt(transcripts);
            const contexto = this._buildSessionContext(session, transcriptBlock);

            // O system prompt carrega prompt + metadados + transcrição e é IDÊNTICO entre
            // as perguntas da mesma reunião — é isso que faz o prompt caching do provedor
            // pegar (o provider Anthropic já marca o system com cache_control).
            const systemPrompt = getSystemPrompt('v4_ask_sessao', contexto, false);

            const messages = [{ role: 'system', content: systemPrompt }];

            // Continuidade da conversa: últimos turnos como mensagens de verdade, depois
            // do bloco imutável e antes da pergunta.
            for (const msg of historico.slice(-HISTORY_TURNS)) {
                if (msg.role === 'user' || msg.role === 'assistant') {
                    messages.push({ role: msg.role, content: msg.content });
                }
            }

            messages.push({ role: 'user', content: pergunta });

            this._emitSessionStream({ sessionId, type: 'start', question: pergunta });

            // require tardio: o e2e stuba a factory, e o destructuring do topo do
            // arquivo congelaria a referência antes do stub.
            const { createStreamingLLM: criarStream } = require('../common/ai/factory');
            const streamingLLM = criarStream(modelInfo.provider, {
                apiKey: modelInfo.apiKey,
                model: modelInfo.model,
                temperature: 0.5,
                maxTokens: 2048,
            });

            const response = await streamingLLM.streamChat(messages);
            const reader = response.body.getReader();
            signal.addEventListener('abort', () => {
                reader.cancel(signal.reason).catch(() => {});
            });

            const texto = await this._processSessionStream(reader, sessionId, signal, modelInfo.model, { fonte, ownerUid });
            return { success: true, response: texto };
        } catch (error) {
            console.error(`[AskService] Erro na conversa sobre a sessão ${sessionId}:`, error.message);
            this._emitSessionStream({ sessionId, type: 'error', error: error.message });
            return { success: false, error: error.message };
        } finally {
            if (this.sessionAbortControllers.get(sessionId) === controller) {
                this.sessionAbortControllers.delete(sessionId);
            }
        }
    }

    /**
     * Lê o SSE, emite os tokens no canal da sessão e grava a resposta em ai_messages
     * da própria sessão. Mesmo abortada, o que já foi gerado é salvo.
     *
     * @returns {Promise<string>} resposta completa
     * @private
     */
    async _processSessionStream(reader, sessionId, signal, model, destino = { fonte: 'local', ownerUid: null }) {
        const decoder = new TextDecoder();
        let fullResponse = '';
        let erro = null;

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const linhas = decoder.decode(value).split('\n').filter(l => l.trim() !== '');
                for (const linha of linhas) {
                    if (!linha.startsWith('data: ')) continue;
                    const data = linha.substring(6);
                    if (data === '[DONE]') {
                        return await this._finalizeSessionStream(sessionId, fullResponse, model, null, destino);
                    }
                    try {
                        const token = JSON.parse(data).choices[0]?.delta?.content || '';
                        if (token) {
                            fullResponse += token;
                            this._emitSessionStream({ sessionId, type: 'chunk', token, content: fullResponse });
                        }
                    } catch (_) {
                        // linha SSE parcial/não-JSON — ignora
                    }
                }
            }
        } catch (streamError) {
            if (signal.aborted) {
                console.log(`[AskService] Stream da sessão ${sessionId} cancelado: ${signal.reason}`);
            } else {
                erro = streamError.message;
                console.error(`[AskService] Erro no stream da sessão ${sessionId}:`, streamError);
            }
        }

        return await this._finalizeSessionStream(sessionId, fullResponse, model, erro, destino);
    }

    /** @private */
    async _finalizeSessionStream(sessionId, fullResponse, model, erro, destino = { fonte: 'local', ownerUid: null }) {
        if (fullResponse) {
            try {
                await this._gravarMensagem({
                    sessionId,
                    fonte: destino.fonte,
                    ownerUid: destino.ownerUid,
                    role: 'assistant',
                    content: fullResponse,
                    model,
                });
                // `touch` só faz sentido na sessão local; a da nuvem não é nossa.
                if (destino.fonte !== 'cloud') await sessionRepository.touch(sessionId);
            } catch (dbError) {
                console.error('[AskService] Falha ao salvar resposta da sessão:', dbError.message);
            }
        }

        if (erro) {
            this._emitSessionStream({ sessionId, type: 'error', error: erro, content: fullResponse });
        } else {
            this._emitSessionStream({ sessionId, type: 'done', content: fullResponse });
        }

        return fullResponse;
    }

    /** Histórico da conversa de uma sessão, em ordem cronológica (local ou da nuvem). */
    async getSessionAiMessages(sessionId, source = 'local') {
        if (!sessionId) return [];
        return await this._historicoDaSessao(sessionId, source === 'cloud' ? 'cloud' : 'local');
    }

    /** Cancela o stream em andamento de uma sessão (usuário fechou a tela, por exemplo). */
    stopSessionAnswer(sessionId) {
        const controller = this.sessionAbortControllers.get(sessionId);
        if (controller) {
            controller.abort('Cancelado pelo usuário.');
            this.sessionAbortControllers.delete(sessionId);
            return { success: true, stopped: true };
        }
        return { success: true, stopped: false };
    }

    /**
     * 멀티모달 관련 에러인지 판단
     * @private
     */
    _isMultimodalError(error) {
        const errorMessage = error.message?.toLowerCase() || '';
        return (
            errorMessage.includes('vision') ||
            errorMessage.includes('image') ||
            errorMessage.includes('multimodal') ||
            errorMessage.includes('unsupported') ||
            errorMessage.includes('image_url') ||
            errorMessage.includes('400') ||  // Bad Request often for unsupported features
            errorMessage.includes('invalid') ||
            errorMessage.includes('not supported')
        );
    }

}

const askService = new AskService();

module.exports = askService;