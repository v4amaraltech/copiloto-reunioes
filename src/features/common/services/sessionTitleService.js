// Título da sessão gerado por IA a partir da própria transcrição.
//
// Roda DEPOIS que a escuta termina (nunca no caminho crítico do encerramento) e
// também num backfill no boot, para as calls que já existiam com "Session @ <hora>".
// Sem chave configurada, sem transcrição suficiente ou com erro da LLM, o título
// padrão simplesmente permanece — nada quebra.
//
// Ordem de preferência do título (docs/VINCULO-REUNIAO.md):
//   calendar_title (fatia 3) → título por IA → Session @ <hora>

const sessionRepository = require('../repositories/session');
const sttRepository = require('../../listen/stt/repositories');
const modelStateService = require('./modelStateService');

// Falas mandadas à LLM: o começo da call é onde as pessoas dizem quem são e do
// que vão falar — é o suficiente para nomear a reunião.
const FALAS_NO_PROMPT = 40;
// Abaixo disso não há conversa suficiente para um título melhor que o padrão.
const MIN_FALAS = 6;
// Teto de sessões tituladas por boot, para não estourar a API do cliente de uma vez.
const MAX_POR_BOOT = 40;
// Respiro entre chamadas do backfill.
const PAUSA_ENTRE_SESSOES_MS = 1000;
// A LLM não pode segurar o encerramento da call indefinidamente.
const TIMEOUT_LLM_MS = 30000;

const PROMPT_SISTEMA = [
    'Você nomeia reuniões a partir da transcrição.',
    'Responda APENAS com o título, em português do Brasil, no máximo 8 palavras.',
    'Sem aspas, sem ponto final, sem prefixos como "Título:".',
    'Prefira o assunto concreto e, quando aparecer, o nome da empresa ou da pessoa.',
].join(' ');

function comTimeout(promessa, ms, mensagem) {
    let timer;
    return Promise.race([
        promessa.finally(() => clearTimeout(timer)),
        new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error(mensagem)), ms);
        }),
    ]);
}

/**
 * Limpa o que a LLM devolveu: tira aspas, ponto final, prefixos e corta em 8 palavras.
 * @returns {string|null} título utilizável, ou null se veio vazio/inútil.
 */
function normalizarTitulo(bruto) {
    if (!bruto || typeof bruto !== 'string') return null;

    let titulo = bruto.trim().split('\n')[0].trim();
    titulo = titulo.replace(/^(t[íi]tulo|title)\s*[:\-–]\s*/i, '');
    titulo = titulo.replace(/^["'“”‘’«»]+|["'“”‘’«»]+$/g, '').trim();
    titulo = titulo.replace(/[.。]+$/, '').trim();
    titulo = titulo.replace(/\s+/g, ' ');

    if (!titulo) return null;

    const palavras = titulo.split(' ');
    if (palavras.length > 8) {
        // Cortar em 8 pode deixar uma preposição pendurada ("...fornecedores de").
        // Descartar essas sobras deixa o título curto, mas inteiro.
        const conectivos = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'com', 'para', 'em', 'no', 'na', 'a', 'o', 'que', 'por']);
        const cortadas = palavras.slice(0, 8);
        while (cortadas.length > 1 && conectivos.has(cortadas[cortadas.length - 1].toLowerCase())) {
            cortadas.pop();
        }
        titulo = cortadas.join(' ');
    }

    // Uma resposta enorme é sinal de que a LLM ignorou a instrução; melhor manter o padrão.
    if (titulo.length > 120) return null;

    return titulo;
}

function formatarFalas(transcripts) {
    return transcripts
        .slice(0, FALAS_NO_PROMPT)
        .map(t => `${(t.speaker || 'fala').toLowerCase()}: ${(t.text || '').trim()}`)
        .filter(linha => linha.length > 6)
        .join('\n');
}

/**
 * Gera e grava o título de UMA sessão.
 *
 * @param {string} sessionId
 * @param {{pushToRemote?: boolean}} [opcoes] - pushToRemote atualiza o documento no
 *        Appwrite (usado no backfill, quando a sessão pode já ter sido enviada).
 * @returns {Promise<{ok: boolean, title?: string, reason?: string}>}
 */
async function generateForSession(sessionId, { pushToRemote = false } = {}) {
    if (!sessionId) return { ok: false, reason: 'sem_sessao' };

    try {
        const transcripts = (await sttRepository.getAllTranscriptsBySessionId(sessionId)) || [];
        if (transcripts.length < MIN_FALAS) {
            return { ok: false, reason: 'transcricao_curta' };
        }

        const modelInfo = await modelStateService.getCurrentModelInfo('llm');
        if (!modelInfo || !modelInfo.apiKey) {
            // Sem chave configurada: pula em silêncio, como manda o requisito.
            return { ok: false, reason: 'sem_chave' };
        }

        const falas = formatarFalas(transcripts);
        if (!falas.trim()) return { ok: false, reason: 'transcricao_vazia' };

        const { createLLM } = require('../ai/factory');
        const llm = createLLM(modelInfo.provider, {
            apiKey: modelInfo.apiKey,
            model: modelInfo.model,
            temperature: 0.3,
            maxTokens: 64,
        });

        const resposta = await comTimeout(
            llm.chat([
                { role: 'system', content: PROMPT_SISTEMA },
                {
                    role: 'user',
                    content: `Início da transcrição de uma reunião:\n\n${falas}\n\nDê um título a esta reunião.`,
                },
            ]),
            TIMEOUT_LLM_MS,
            'timeout ao gerar título'
        );

        const titulo = normalizarTitulo(resposta?.content);
        if (!titulo) return { ok: false, reason: 'resposta_invalida' };

        await sessionRepository.updateTitleWithSource(sessionId, titulo, 'ia');
        console.log(`[SessionTitle] Sessão ${sessionId} titulada: "${titulo}"`);

        if (pushToRemote) {
            try {
                const v4SyncService = require('./v4SyncService');
                await v4SyncService.pushSessionTitle(sessionId, titulo);
            } catch (err) {
                console.warn('[SessionTitle] Falha ao propagar título ao Appwrite:', err.message);
            }
        }

        return { ok: true, title: titulo };
    } catch (err) {
        console.warn(`[SessionTitle] Não foi possível titular ${sessionId}:`, err.message);
        return { ok: false, reason: 'erro_llm' };
    }
}

/**
 * Backfill: nomeia as sessões antigas que ficaram com "Session @ <hora>".
 * Roda em background no boot, uma por vez e com pausa entre elas.
 *
 * @returns {Promise<{tituladas: number, tentadas: number}>}
 */
async function backfillTitles({ limit = MAX_POR_BOOT, pauseMs = PAUSA_ENTRE_SESSOES_MS } = {}) {
    let tentadas = 0;
    let tituladas = 0;

    try {
        const pendentes = await sessionRepository.getSessionsNeedingTitle({
            minTurns: MIN_FALAS,
            limit,
        });

        if (!pendentes || pendentes.length === 0) {
            console.log('[SessionTitle] Backfill: nenhuma sessão pendente.');
            return { tituladas, tentadas };
        }

        // Uma checagem só antes do loop: sem chave, não adianta iterar.
        const modelInfo = await modelStateService.getCurrentModelInfo('llm');
        if (!modelInfo || !modelInfo.apiKey) {
            console.log('[SessionTitle] Backfill adiado: nenhuma LLM configurada.');
            return { tituladas, tentadas };
        }

        console.log(`[SessionTitle] Backfill: ${pendentes.length} sessão(ões) sem título próprio.`);

        for (const sessao of pendentes) {
            tentadas++;
            const resultado = await generateForSession(sessao.id, { pushToRemote: true });
            if (resultado.ok) tituladas++;
            if (resultado.reason === 'sem_chave') break; // chave sumiu no meio do caminho
            if (pauseMs > 0) await new Promise(r => setTimeout(r, pauseMs));
        }

        console.log(`[SessionTitle] Backfill concluído: ${tituladas}/${tentadas} tituladas.`);
    } catch (err) {
        console.error('[SessionTitle] Backfill falhou:', err.message);
    }

    return { tituladas, tentadas };
}

module.exports = {
    generateForSession,
    backfillTitles,
    normalizarTitulo,
    MIN_FALAS,
    MAX_POR_BOOT,
};
