#!/usr/bin/env node
/**
 * E2E da Fatia 1 — "dar nome e achar" (docs/VINCULO-REUNIAO.md).
 *
 * Trabalha numa CÓPIA temporária do banco real. O original nunca é aberto para
 * escrita: é copiado (com -wal/-shm) para /tmp e todo o teste roda lá.
 *
 * Prova:
 *   1. a coluna sessions.title_source migra sozinha pelo updateTable;
 *   2. transcripts_fts é criada e populada com as transcrições existentes;
 *   3. a busca por uma palavra real devolve sessões agrupadas, com snippets;
 *   4. a busca com aspas/asteriscos/parênteses não quebra;
 *   5. o título por IA grava title/title_source (LLM stubada) e o backfill roda.
 *
 * Uso:
 *   ELECTRON_RUN_AS_NODE=1 ./node_modules/.bin/electron scripts/vinculo/e2e-fatia1.js
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const RAIZ = path.resolve(__dirname, '..', '..');
const DB_REAL = path.join(os.homedir(), 'Library', 'Application Support', 'Copiloto V4', 'pickleglass.db');

let falhas = 0;
function checar(descricao, condicao, detalhe = '') {
    const marca = condicao ? '  OK  ' : ' FALHA';
    console.log(`[${marca}] ${descricao}${detalhe ? ` — ${detalhe}` : ''}`);
    if (!condicao) falhas++;
}

// --- Stubs: o script roda fora do Electron, então `electron` e a LLM são fingidos ---

const chamadasLlm = [];
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
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
            BrowserWindow: { getAllWindows: () => [] },
            ipcMain: { handle: () => {}, on: () => {} },
            safeStorage: { isEncryptionAvailable: () => false },
        };
    }
    return originalLoad.apply(this, arguments);
};

// --- Preparação: cópia do banco real ---

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-fatia1-'));
const dbCopia = path.join(tmpDir, 'pickleglass.db');

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

async function main() {
    copiarBanco();

    const sqliteClient = require(path.join(RAIZ, 'src/features/common/services/sqliteClient'));
    const searchRepo = require(path.join(RAIZ, 'src/features/common/repositories/search/sqlite.repository'));
    const sessionRepo = require(path.join(RAIZ, 'src/features/common/repositories/session/sqlite.repository'));

    // ---------- 1) Schema: coluna nova migra sozinha ----------
    console.log('\n== 1. Migração de schema ==');
    sqliteClient.connect(dbCopia);
    const db = sqliteClient.getDb();

    const tinhaAntes = db
        .prepare('PRAGMA table_info(sessions)')
        .all()
        .some(c => c.name === 'title_source');

    await sqliteClient.synchronizeSchema();

    const colunas = db.prepare('PRAGMA table_info(sessions)').all().map(c => c.name);
    checar('sessions.title_source existe após o sync', colunas.includes('title_source'),
        tinhaAntes ? 'já existia' : 'adicionada agora pelo updateTable');

    // ---------- 2) Índice FTS5 criado e populado ----------
    console.log('\n== 2. Índice de busca (FTS5) ==');
    checar('índice de busca reportado como pronto', sqliteClient.isSearchIndexReady());

    const tabelas = sqliteClient.getTablesFromDb();
    checar('tabela virtual transcripts_fts existe', tabelas.includes('transcripts_fts'));

    const totalTranscripts = db.prepare('SELECT COUNT(*) n FROM transcripts').get().n;
    // _docsize é a shadow table que sabe quantos documentos estão de fato indexados
    // (COUNT(*) na tabela FTS leria o conteúdo externo, não o índice).
    const totalIndexados = db.prepare('SELECT COUNT(*) n FROM transcripts_fts_docsize').get().n;
    checar('índice populado com as transcrições existentes',
        totalIndexados === totalTranscripts && totalTranscripts > 0,
        `${totalIndexados}/${totalTranscripts}`);

    const triggers = db
        .prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'transcripts_fts%'")
        .all()
        .map(t => t.name);
    checar('triggers de insert/update/delete criados', triggers.length === 3, triggers.join(', '));

    // Trigger na prática: insere uma fala nova e ela precisa aparecer no índice.
    const uidTeste = db.prepare('SELECT uid FROM sessions LIMIT 1').get()?.uid || 'default_user';
    const sessaoTeste = db.prepare('SELECT id FROM sessions WHERE uid = ? LIMIT 1').get(uidTeste)?.id;
    const marcador = 'zebrapalavraunica' + Date.now();
    db.prepare(
        'INSERT INTO transcripts (id, session_id, start_at, speaker, text, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run('e2e-' + Date.now(), sessaoTeste, 1, 'them', `falando sobre ${marcador} agora`, 1);
    const achouNovo = db
        .prepare('SELECT COUNT(*) n FROM transcripts_fts WHERE transcripts_fts MATCH ?')
        .get(`"${marcador}"`).n;
    checar('trigger de INSERT indexa fala nova', achouNovo === 1);

    // ---------- 3) Busca por palavra real ----------
    console.log('\n== 3. Busca por conteúdo ==');
    // Escolhe uma palavra que realmente existe nas transcrições do banco.
    const amostra = db
        .prepare("SELECT text FROM transcripts WHERE text IS NOT NULL AND length(text) > 40 LIMIT 200")
        .all();
    const frequencia = new Map();
    for (const linha of amostra) {
        for (const palavra of linha.text.toLowerCase().split(/[^\p{L}]+/u)) {
            if (palavra.length >= 6) frequencia.set(palavra, (frequencia.get(palavra) || 0) + 1);
        }
    }
    const palavraComum = [...frequencia.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    console.log(`   palavra escolhida da própria transcrição: "${palavraComum}"`);

    const resultados = searchRepo.search(uidTeste, palavraComum, 10);
    checar('busca devolve ao menos uma sessão', resultados.length > 0, `${resultados.length} sessão(ões)`);
    checar('resultados vêm agrupados por sessão (sem id repetido)',
        new Set(resultados.map(r => r.id)).size === resultados.length);
    const comSnippet = resultados.filter(r => r.snippets.length > 0);
    checar('sessões trazem snippets do FTS5', comSnippet.length > 0);
    checar('no máximo 2 snippets por sessão', resultados.every(r => r.snippets.length <= 2));
    checar('snippets destacam o termo com []', comSnippet.some(r => r.snippets[0].includes('[')));
    checar('match_count preenchido', resultados.every(r => r.match_count >= 0));
    if (resultados[0]) {
        const r = resultados[0];
        console.log(`   ex.: "${r.title}" (${r.match_count} trecho(s)) → ${r.snippets[0] || '(sem snippet)'}`);
        checar('resultado traz id/title/started_at/ended_at',
            'id' in r && 'title' in r && 'started_at' in r && 'ended_at' in r);
    }

    // ---------- 4) Caracteres especiais não quebram ----------
    console.log('\n== 4. Query com caracteres especiais ==');
    const perigosas = [
        '"aspas abertas',
        '*',
        'preço: "R$ 5.000"',
        'a AND OR NOT (b',
        'reunião^2 NEAR/3',
        '"""',
        '   ',
        '()*"',
        `${palavraComum}*`,
    ];
    let quebrou = null;
    for (const q of perigosas) {
        try {
            const r = searchRepo.search(uidTeste, q, 5);
            if (!Array.isArray(r)) quebrou = `${q} → retorno não é array`;
        } catch (err) {
            quebrou = `${JSON.stringify(q)} → ${err.message}`;
            break;
        }
    }
    checar('nenhuma query especial lança erro', quebrou === null, quebrou || `${perigosas.length} variações`);
    checar('busca com asterisco literal encontra o mesmo termo',
        searchRepo.search(uidTeste, `${palavraComum}*`, 5).length > 0);

    // ---------- 5) Título por IA (LLM stubada) + backfill ----------
    console.log('\n== 5. Título por IA e backfill ==');

    // Stub da LLM e do modelo ativo, sem tocar na API real do usuário.
    const factory = require(path.join(RAIZ, 'src/features/common/ai/factory'));
    factory.createLLM = () => ({
        chat: async (messages) => {
            chamadasLlm.push(messages);
            return { content: '  "Reunião com a Acme sobre proposta."  ' };
        },
    });
    const modelStateService = require(path.join(RAIZ, 'src/features/common/services/modelStateService'));
    modelStateService.getCurrentModelInfo = async () => ({
        provider: 'openai',
        model: 'gpt-4.1',
        apiKey: 'stub',
    });
    // O adapter de sessão injeta o uid a partir do authService.
    const authService = require(path.join(RAIZ, 'src/features/common/services/authService'));
    authService.getCurrentUserId = () => uidTeste;

    // O backfill propaga o título ao Appwrite. Num teste isso não pode sair da
    // máquina: o envio é stubado e apenas registrado.
    const enviosRemotos = [];
    const v4SyncService = require(path.join(RAIZ, 'src/features/common/services/v4SyncService'));
    v4SyncService.pushSessionTitle = async (sessionId, title) => {
        enviosRemotos.push({ sessionId, title });
        return { success: true, stub: true };
    };

    const sessionTitleService = require(path.join(RAIZ, 'src/features/common/services/sessionTitleService'));

    checar('normalizarTitulo tira aspas e ponto final',
        sessionTitleService.normalizarTitulo('  "Call com a Acme."  ') === 'Call com a Acme');
    checar('normalizarTitulo corta em 8 palavras',
        sessionTitleService.normalizarTitulo('um dois tres quatro cinco seis sete oito nove dez')
            .split(' ').length === 8);

    const pendentes = sessionRepo.getSessionsNeedingTitle(uidTeste, { minTurns: 6, limit: 40 });
    console.log(`   sessões elegíveis para título por IA: ${pendentes.length}`);
    checar('há sessões elegíveis (título "Session @" + >= 6 falas)', pendentes.length > 0);

    if (pendentes.length > 0) {
        const alvo = pendentes[0].id;
        const r = await sessionTitleService.generateForSession(alvo);
        checar('generateForSession devolve ok', r.ok, r.title || r.reason);

        const depois = sessionRepo.getById(alvo);
        checar('title gravado no banco', depois.title === 'Reunião com a Acme sobre proposta');
        checar("title_source gravado como 'ia'", depois.title_source === 'ia');
        checar('prompt enviado contém falas da transcrição',
            chamadasLlm[0]?.[1]?.content?.includes('transcrição'));
    }

    // Sessão com transcrição curta mantém o título padrão.
    const curta = db
        .prepare(`
            SELECT s.id, s.title FROM sessions s
            LEFT JOIN transcripts t ON t.session_id = s.id
            WHERE s.uid = ?
            GROUP BY s.id HAVING COUNT(t.id) < 6
            LIMIT 1
        `)
        .get(uidTeste);
    if (curta) {
        const antes = curta.title;
        const r = await sessionTitleService.generateForSession(curta.id);
        checar('transcrição curta não é titulada', !r.ok && r.reason === 'transcricao_curta');
        checar('título padrão preservado', sessionRepo.getById(curta.id).title === antes);
    } else {
        console.log('   (nenhuma sessão com < 6 falas neste banco — caso não exercitado)');
    }

    // Backfill: limite pequeno e sem pausa, só para provar o laço.
    const antesBackfill = sessionRepo.getSessionsNeedingTitle(uidTeste, { minTurns: 6, limit: 100 }).length;
    const resultadoBackfill = await sessionTitleService.backfillTitles({ limit: 3, pauseMs: 0 });
    const depoisBackfill = sessionRepo.getSessionsNeedingTitle(uidTeste, { minTurns: 6, limit: 100 }).length;
    checar('backfill titula respeitando o limite',
        resultadoBackfill.tituladas > 0 && resultadoBackfill.tituladas <= 3,
        `${resultadoBackfill.tituladas} tituladas`);
    checar('fila de pendentes diminui', depoisBackfill < antesBackfill,
        `${antesBackfill} → ${depoisBackfill}`);
    checar('backfill propaga o título novo ao Appwrite (envio stubado)',
        enviosRemotos.length === resultadoBackfill.tituladas,
        `${enviosRemotos.length} envio(s) — nenhum saiu da máquina`);

    // Sem chave configurada, o backfill pula em silêncio.
    modelStateService.getCurrentModelInfo = async () => null;
    const semChave = await sessionTitleService.backfillTitles({ limit: 3, pauseMs: 0 });
    checar('sem chave configurada, nada é titulado', semChave.tituladas === 0 && semChave.tentadas === 0);

    // ---------- 6) Busca pelo título recém-gerado ----------
    console.log('\n== 6. Busca pelo título gerado ==');
    const porTitulo = searchRepo.search(uidTeste, 'Acme', 10);
    checar('sessão titulada é encontrada pelo título', porTitulo.some(r => r.matched_title));

    // ---------- Fim ----------
    sqliteClient.close();
    console.log('\n' + '='.repeat(60));
    if (falhas === 0) {
        console.log('E2E FATIA 1: TODOS OS CHECKS PASSARAM');
    } else {
        console.log(`E2E FATIA 1: ${falhas} CHECK(S) FALHARAM`);
    }
    console.log(`Banco original intacto: ${DB_REAL}`);
    console.log(`Cópia usada no teste:   ${dbCopia}`);
    process.exit(falhas === 0 ? 0 : 1);
}

main().catch(err => {
    console.error('\nErro fatal no e2e:', err);
    process.exit(1);
});
