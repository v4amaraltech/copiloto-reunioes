#!/usr/bin/env node
/**
 * E2E da Fatia 2 — conversar com uma reunião passada (docs/VINCULO-REUNIAO.md, seção B).
 *
 * Trabalha numa CÓPIA temporária do banco real; o original nunca é aberto para escrita.
 *
 * Prova:
 *   1. a pergunta e a resposta ficam em ai_messages DA SESSÃO ALVO;
 *   2. nenhuma sessão nova é criada (o contador de sessions não muda);
 *   3. o prompt leva a transcrição INTEIRA antes da pergunta, e a pergunta é a última
 *      mensagem — a ordem que faz o prompt caching valer;
 *   4. não há screenshot (nenhum bloco de imagem no prompt);
 *   5. os eventos de streaming chegam com o sessionId e na ordem start → chunk → done;
 *   6. o histórico volta em ordem cronológica e alimenta a pergunta seguinte;
 *   7. transcrição acima do teto vai truncada no meio, com aviso;
 *   8. sessão sem transcrição e pergunta vazia devolvem erro amigável em pt-BR.
 *
 * Uso:
 *   ELECTRON_RUN_AS_NODE=1 ./node_modules/.bin/electron scripts/vinculo/e2e-fatia2.js
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const RAIZ = path.resolve(__dirname, '..', '..');
const DB_REAL = path.join(os.homedir(), 'Library', 'Application Support', 'Copiloto V4', 'pickleglass.db');

let falhas = 0;
function checar(descricao, condicao, detalhe = '') {
    console.log(`[${condicao ? '  OK  ' : ' FALHA'}] ${descricao}${detalhe ? ` — ${detalhe}` : ''}`);
    if (!condicao) falhas++;
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-fatia2-'));
const dbCopia = path.join(tmpDir, 'pickleglass.db');

// --- Stubs: fora do Electron, `electron` é fingido; as janelas viram um coletor de eventos ---

const eventosStream = [];
const janelaFake = {
    isDestroyed: () => false,
    webContents: {
        send: (canal, payload) => eventosStream.push({ canal, payload }),
    },
};

const originalLoad = Module._load;
Module._load = function (request) {
    if (request === 'electron') {
        return {
            app: {
                getPath: () => tmpDir,
                getVersion: () => '0.0.0-e2e',
                getName: () => 'Copiloto V4 (e2e)',
                isPackaged: false,
                getAppPath: () => RAIZ,
                on: () => {},
                whenReady: () => Promise.resolve(),
            },
            BrowserWindow: { getAllWindows: () => [janelaFake] },
            ipcMain: { handle: () => {}, on: () => {} },
            desktopCapturer: { getSources: async () => [] },
            safeStorage: { isEncryptionAvailable: () => false },
        };
    }
    // O askService pega o windowPool pelo windowManager; devolvemos só a janela fake
    // para capturar os eventos de streaming sem abrir UI.
    if (request === '../../window/windowManager') {
        return { windowPool: new Map([['ask', janelaFake]]) };
    }
    return originalLoad.apply(this, arguments);
};

function copiarBanco() {
    if (!fs.existsSync(DB_REAL)) {
        console.error(`Banco real não encontrado em ${DB_REAL}. Nada a testar.`);
        process.exit(2);
    }
    for (const sufixo of ['', '-wal', '-shm']) {
        const origem = DB_REAL + sufixo;
        if (fs.existsSync(origem)) fs.copyFileSync(origem, dbCopia + sufixo);
    }
    console.log(`Cópia do banco real em ${dbCopia} (o original não é tocado).`);
}

/** Monta um Response SSE igual ao que os providers devolvem. */
function respostaSseFake(texto) {
    const pedacos = texto.match(/.{1,12}/gs) || [];
    const stream = new ReadableStream({
        start(controller) {
            for (const p of pedacos) {
                const data = JSON.stringify({ choices: [{ delta: { content: p } }] });
                controller.enqueue(new TextEncoder().encode(`data: ${data}\n\n`));
            }
            controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
            controller.close();
        },
    });
    return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } });
}

async function main() {
    copiarBanco();

    const sqliteClient = require(path.join(RAIZ, 'src/features/common/services/sqliteClient'));
    sqliteClient.connect(dbCopia);
    await sqliteClient.synchronizeSchema();
    const db = sqliteClient.getDb();

    const uid = db.prepare('SELECT uid FROM sessions LIMIT 1').get()?.uid || 'default_user';
    const authService = require(path.join(RAIZ, 'src/features/common/services/authService'));
    authService.getCurrentUserId = () => uid;

    // Modelo e LLM stubados: nada sai da máquina.
    const modelStateService = require(path.join(RAIZ, 'src/features/common/services/modelStateService'));
    modelStateService.getCurrentModelInfo = async () => ({ provider: 'openai', model: 'gpt-4.1', apiKey: 'stub' });

    const promptsEnviados = [];
    const factory = require(path.join(RAIZ, 'src/features/common/ai/factory'));
    factory.createStreamingLLM = () => ({
        streamChat: async (messages) => {
            promptsEnviados.push(messages);
            return respostaSseFake('Ele disse que o orçamento estava apertado, mas topou a proposta.');
        },
    });

    const askService = require(path.join(RAIZ, 'src/features/ask/askService'));

    // Sessão alvo: a que tem mais falas transcritas.
    const alvo = db.prepare(`
        SELECT s.id, s.title, COUNT(t.id) AS turns
        FROM sessions s JOIN transcripts t ON t.session_id = s.id
        WHERE s.uid = ?
        GROUP BY s.id ORDER BY turns DESC LIMIT 1
    `).get(uid);
    console.log(`Sessão alvo: ${alvo.id} — "${alvo.title}" (${alvo.turns} falas)`);

    const contarSessoes = () => db.prepare('SELECT COUNT(*) n FROM sessions').get().n;
    const contarMensagens = (id) => db.prepare('SELECT COUNT(*) n FROM ai_messages WHERE session_id = ?').get(id).n;

    // ---------- 1) Pergunta grava na sessão alvo, sem criar sessão nova ----------
    console.log('\n== 1. Pergunta e resposta na sessão alvo ==');
    const sessoesAntes = contarSessoes();
    const mensagensAntes = contarMensagens(alvo.id);

    const r1 = await askService.askAboutSession({
        sessionId: alvo.id,
        question: 'O que o lead falou sobre preço?',
    });
    checar('askAboutSession devolve success', r1.success === true, r1.error || '');
    checar('resposta completa devolvida', (r1.response || '').includes('orçamento'));

    checar('nenhuma sessão nova foi criada', contarSessoes() === sessoesAntes,
        `${sessoesAntes} → ${contarSessoes()}`);

    const novas = db.prepare(
        'SELECT role, content FROM ai_messages WHERE session_id = ? ORDER BY sent_at ASC, rowid ASC'
    ).all(alvo.id).slice(mensagensAntes);
    checar('2 mensagens novas na sessão alvo (pergunta + resposta)', novas.length === 2,
        novas.map(m => m.role).join(', '));
    checar('pergunta gravada com role user',
        novas[0]?.role === 'user' && novas[0]?.content === 'O que o lead falou sobre preço?');
    checar('resposta gravada com role assistant',
        novas[1]?.role === 'assistant' && (novas[1]?.content || '').includes('orçamento'));

    const emOutrasSessoes = db.prepare(`
        SELECT COUNT(*) n FROM ai_messages
        WHERE session_id != ? AND content = 'O que o lead falou sobre preço?'
    `).get(alvo.id).n;
    checar('nada foi gravado em outra sessão', emOutrasSessoes === 0);

    // ---------- 2) Formato do prompt ----------
    console.log('\n== 2. Prompt: transcrição antes da pergunta ==');
    const prompt = promptsEnviados[0];
    const system = prompt[0];
    const ultima = prompt[prompt.length - 1];

    checar('primeira mensagem é o system prompt', system.role === 'system');
    checar('system usa o template v4_ask_sessao',
        system.content.includes('reunião que JÁ ACONTECEU'));
    checar('system traz título, data e duração da reunião',
        system.content.includes('Título:') && system.content.includes('Quando:') && system.content.includes('Duração:'));
    checar('system instrui a dizer quando algo não está na transcrição',
        system.content.includes('não aparece na transcrição'));

    const transcripts = db.prepare(
        'SELECT speaker, text FROM transcripts WHERE session_id = ? ORDER BY start_at ASC'
    ).all(alvo.id);
    const linhasEsperadas = transcripts
        .map(t => `${(t.speaker || 'fala').toLowerCase()}: ${(t.text || '').trim()}`)
        .filter(l => l.length > 6);
    const todasPresentes = linhasEsperadas.every(l => system.content.includes(l));
    checar('transcrição INTEIRA está no system prompt', todasPresentes,
        `${linhasEsperadas.length} falas`);

    checar('última mensagem é a pergunta do closer',
        ultima.role === 'user' && ultima.content === 'O que o lead falou sobre preço?');
    checar('a transcrição vem ANTES da pergunta (system é a mensagem 0)',
        prompt.indexOf(system) === 0 && prompt.indexOf(ultima) === prompt.length - 1);

    const temImagem = JSON.stringify(prompt).includes('image_url') || JSON.stringify(prompt).includes('image');
    checar('nenhum screenshot no prompt', !temImagem);

    // ---------- 3) Eventos de streaming ----------
    console.log('\n== 3. Eventos de streaming ==');
    const doCanal = eventosStream.filter(e => e.canal === 'sessions:ask-stream').map(e => e.payload);
    checar('eventos saem no canal sessions:ask-stream', doCanal.length > 0, `${doCanal.length} eventos`);
    checar('todo evento leva o sessionId da reunião', doCanal.every(e => e.sessionId === alvo.id));
    checar('primeiro evento é start com a pergunta',
        doCanal[0]?.type === 'start' && doCanal[0]?.question === 'O que o lead falou sobre preço?');
    checar('último evento é done com a resposta completa',
        doCanal[doCanal.length - 1]?.type === 'done' &&
        doCanal[doCanal.length - 1]?.content === r1.response);
    const chunks = doCanal.filter(e => e.type === 'chunk');
    checar('chunks trazem token e conteúdo acumulado',
        chunks.length > 1 && chunks.every(c => typeof c.token === 'string' && typeof c.content === 'string'));
    checar('conteúdo acumulado cresce monotonicamente',
        chunks.every((c, i) => i === 0 || c.content.startsWith(chunks[i - 1].content)));

    // ---------- 4) Histórico ----------
    console.log('\n== 4. Histórico da conversa ==');
    const historico = await askService.getSessionAiMessages(alvo.id);
    checar('getSessionAiMessages devolve as mensagens', historico.length >= 2);
    const ordenado = historico.every((m, i) => i === 0 || (m.sent_at || 0) >= (historico[i - 1].sent_at || 0));
    checar('histórico volta em ordem cronológica', ordenado);
    const ultimasDuas = historico.slice(-2);
    checar('últimas duas são a pergunta e a resposta desta rodada',
        ultimasDuas[0].role === 'user' && ultimasDuas[1].role === 'assistant');

    // Segunda pergunta: o histórico anterior tem de entrar como turnos reais,
    // depois do bloco imutável e antes da pergunta nova.
    const r2 = await askService.askAboutSession({ sessionId: alvo.id, question: 'E os próximos passos?' });
    checar('segunda pergunta também responde', r2.success === true, r2.error || '');
    const prompt2 = promptsEnviados[1];
    checar('system prompt idêntico entre as perguntas (prompt caching)',
        prompt2[0].content === system.content);
    checar('histórico entra entre o system e a pergunta nova',
        prompt2.length > prompt.length &&
        prompt2.some(m => m.role === 'assistant' && (m.content || '').includes('orçamento')));
    checar('pergunta nova é a última mensagem',
        prompt2[prompt2.length - 1].content === 'E os próximos passos?');
    checar('pergunta anterior não aparece duplicada no mesmo prompt',
        prompt2.filter(m => m.content === 'O que o lead falou sobre preço?').length === 1);

    // ---------- 5) Truncamento ----------
    console.log('\n== 5. Transcrição acima do teto ==');
    const grande = Array.from({ length: 5000 }, (_, i) => ({
        speaker: i % 2 ? 'them' : 'me',
        text: `fala numero ${i} com bastante texto para encher a transcricao ate passar do teto de caracteres`,
    }));
    const bloco = askService._formatTranscriptForPrompt(grande);
    checar('transcrição grande é marcada como truncada', bloco.truncada === true);
    checar('tamanho enviado respeita o teto', bloco.texto.length <= 120000 + 300,
        `${bloco.texto.length} chars`);
    checar('aviso de corte do meio está no texto',
        bloco.texto.includes('foram omitidos por limite de tamanho'));
    checar('começo e fim da reunião preservados',
        bloco.texto.includes('fala numero 0 ') && bloco.texto.includes('fala numero 4999 '));
    const blocoPequeno = askService._formatTranscriptForPrompt(grande.slice(0, 10));
    checar('transcrição pequena não é truncada', blocoPequeno.truncada === false);

    // ---------- 6) Erros amigáveis ----------
    console.log('\n== 6. Erros amigáveis em pt-BR ==');
    const semTranscricao = db.prepare(`
        SELECT s.id FROM sessions s
        LEFT JOIN transcripts t ON t.session_id = s.id
        WHERE s.uid = ? GROUP BY s.id HAVING COUNT(t.id) = 0 LIMIT 1
    `).get(uid);

    let idSemTranscricao = semTranscricao?.id;
    if (!idSemTranscricao) {
        idSemTranscricao = 'e2e-sem-transcricao';
        db.prepare('INSERT INTO sessions (id, uid, title, session_type, started_at) VALUES (?, ?, ?, ?, ?)')
            .run(idSemTranscricao, uid, 'Sessão vazia', 'listen', 1);
    }
    const rVazia = await askService.askAboutSession({ sessionId: idSemTranscricao, question: 'e aí?' });
    checar('sessão sem transcrição devolve erro amigável',
        rVazia.success === false && rVazia.error.includes('não tem transcrição gravada'), rVazia.error);
    checar('erro de sessão vazia também é emitido no stream',
        eventosStream.some(e => e.payload?.sessionId === idSemTranscricao && e.payload?.type === 'error'));

    const rInexistente = await askService.askAboutSession({ sessionId: 'nao-existe', question: 'e aí?' });
    checar('sessão inexistente devolve erro amigável',
        rInexistente.success === false && rInexistente.error.includes('não foi encontrada'), rInexistente.error);

    const rSemPergunta = await askService.askAboutSession({ sessionId: alvo.id, question: '   ' });
    checar('pergunta vazia é recusada sem chamar a LLM',
        rSemPergunta.success === false && rSemPergunta.error.includes('Digite uma pergunta'));
    checar('pergunta vazia não gravou nada', contarMensagens(alvo.id) === mensagensAntes + 4);

    const rSemSessao = await askService.askAboutSession({ question: 'e aí?' });
    checar('sessionId ausente é recusado', rSemSessao.success === false && rSemSessao.error.includes('não informada'));

    // Sem chave configurada.
    modelStateService.getCurrentModelInfo = async () => null;
    const rSemChave = await askService.askAboutSession({ sessionId: alvo.id, question: 'testando sem chave' });
    checar('sem modelo configurado, erro em pt-BR',
        rSemChave.success === false && rSemChave.error.includes('Nenhum modelo de IA configurado'), rSemChave.error);
    checar('nenhuma sessão nova criada em nenhum dos erros', contarSessoes() === sessoesAntes + (semTranscricao ? 0 : 1));

    sqliteClient.close();
    console.log('\n' + '='.repeat(60));
    console.log(falhas === 0 ? 'E2E FATIA 2: TODOS OS CHECKS PASSARAM' : `E2E FATIA 2: ${falhas} CHECK(S) FALHARAM`);
    console.log(`Banco original intacto: ${DB_REAL}`);
    console.log(`Cópia usada no teste:   ${dbCopia}`);
    process.exit(falhas === 0 ? 0 : 1);
}

main().catch(err => {
    console.error('\nErro fatal no e2e:', err);
    process.exit(1);
});
