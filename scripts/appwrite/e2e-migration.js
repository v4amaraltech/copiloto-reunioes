#!/usr/bin/env node
/**
 * E2E — Migração Supabase → Appwrite (fluxo real do Copiloto V4).
 *
 * Exercita o caminho de produção de ponta a ponta usando os SERVIÇOS REAIS do
 * app (v4AuthService, v4SyncService, sessionRepository, sttRepository,
 * appwriteClient, SQLite) contra o Appwrite self-hosted de verdade. Não há
 * mocks dos serviços: o único ponto injetado é a falha de transporte da etapa 6
 * (ver "Injeção controlada" abaixo).
 *
 * ---------------------------------------------------------------------------
 * O QUE ESTE TESTE **NÃO** COBRE
 * ---------------------------------------------------------------------------
 *  · A UI (renderer): nenhuma janela é aberta. SettingsView, MainHeader,
 *    SummaryView, IPC/preload e o featureBridge NÃO são exercitados. O harness
 *    roda como Node puro (ELECTRON_RUN_AS_NODE) com um stub do módulo
 *    `electron`; `BrowserWindow.getAllWindows()` devolve lista vazia, logo os
 *    broadcasts `user-state-changed` são no-op aqui.
 *  · A captura de áudio real e a transcrição: sttService, Deepgram/Whisper,
 *    loopback do macOS e o SummaryService ficam de fora. As transcrições são
 *    gravadas pelo mesmo par de chamadas que o listenService.saveConversationTurn
 *    faz (sessionRepository.touch + sttRepository.addTranscript) — o que se
 *    valida é a persistência e a sincronização, não o reconhecimento de fala.
 *  · O listenService em si não é instanciado (o construtor liga áudio e LLM);
 *    as etapas 3 e 4 replicam exatamente as chamadas que ele faz em
 *    initializeNewSession() e closeSession().
 *  · Provisionamento do schema: rode `scripts/appwrite/provision.js` antes.
 *
 * ---------------------------------------------------------------------------
 * COMO RODAR
 * ---------------------------------------------------------------------------
 *   E2E_PASSWORD='senha-do-closer' \
 *   ELECTRON_RUN_AS_NODE=1 ./node_modules/.bin/electron scripts/appwrite/e2e-migration.js
 *
 * O Electron é obrigatório porque better-sqlite3 e keytar são compilados contra
 * o ABI do Electron (npm run postinstall) e não carregam no Node do sistema.
 *
 * Variáveis de ambiente:
 *   APPWRITE_ENDPOINT / APPWRITE_PROJECT_ID / APPWRITE_API_KEY  → lidas do .env
 *       da raiz (já no .gitignore). A API key é usada SÓ para a verificação
 *       independente no servidor e para a limpeza — o app nunca a usa.
 *   E2E_PASSWORD  (obrigatória) → senha do closer. Nunca é impressa, nunca fica
 *       no código e não deve ser commitada.
 *   E2E_EMAIL     (opcional, default vinicius.mercante@v4company.com)
 *
 * ---------------------------------------------------------------------------
 * SEGURANÇA E EFEITOS COLATERAIS
 * ---------------------------------------------------------------------------
 *  · Nada de senha, API key ou session secret é impresso — só presença/ausência.
 *  · SQLite e a fila de upload usam um userData ISOLADO em $TMPDIR; o banco real
 *    do app (~/Library/Application Support/Glass) não é tocado.
 *  · O Keychain é global: a entrada `com.v4amaral.copiloto/v4-session` é salva
 *    no início e RESTAURADA no fim (inclusive em erro e em Ctrl-C), para não
 *    derrubar a sessão do usuário no app instalado.
 *  · Revogação (etapa 7) atinge SOMENTE a sessão criada por este teste
 *    (users.deleteSession com o $id da própria sessão) — as outras sessões do
 *    usuário continuam válidas.
 *  · Idempotente: cada execução limpa os documentos que criou e ainda varre
 *    órfãos de execuções anteriores (título com o marcador [E2E]).
 *
 * Injeção controlada (etapa 6): para provar a fila offline sem derrubar a rede
 * da máquina, `databases.createDocument` é temporariamente substituído por uma
 * função que lança erro de rede, e restaurado logo depois. O v4SyncService, a
 * fila em disco e o reenvio (retryPending) são os reais.
 *
 * Saída: cada etapa imprime PASSOU/FALHOU, o fim traz um resumo e o processo
 * sai com código != 0 se qualquer etapa falhar.
 */

'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const Module = require('module');
const { spawnSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const IS_CHILD = process.argv.includes('--child-restore');

// .env da raiz — carregado antes de qualquer require do app (appwriteConfig lê env no load).
require(path.join(PROJECT_ROOT, 'node_modules', 'dotenv')).config({
    path: path.join(PROJECT_ROOT, '.env'),
});

// ---------------------------------------------------------------------------
// Harness: stub do módulo `electron` (sob ELECTRON_RUN_AS_NODE não existe API)
// ---------------------------------------------------------------------------
const E2E_USER_DATA = path.join(os.tmpdir(), 'copiloto-e2e-userdata');

function installElectronStub(userDataDir) {
    fs.mkdirSync(userDataDir, { recursive: true });
    const stub = {
        app: {
            isPackaged: false,
            getAppPath: () => PROJECT_ROOT,
            getName: () => 'Copiloto V4 (E2E)',
            getVersion: () => require(path.join(PROJECT_ROOT, 'package.json')).version,
            getPath: name => {
                if (name === 'userData') return userDataDir;
                const p = path.join(userDataDir, name);
                fs.mkdirSync(p, { recursive: true });
                return p;
            },
            on: () => {},
            quit: () => {},
            whenReady: () => Promise.resolve(),
        },
        BrowserWindow: { getAllWindows: () => [] },
        ipcMain: { on: () => {}, handle: () => {}, removeHandler: () => {} },
        shell: { openExternal: async () => {} },
        safeStorage: { isEncryptionAvailable: () => false },
        systemPreferences: { getMediaAccessStatus: () => 'granted' },
        desktopCapturer: { getSources: async () => [] },
        screen: { getPrimaryDisplay: () => ({ workAreaSize: { width: 1920, height: 1080 } }) },
    };
    const originalLoad = Module._load;
    Module._load = function (request, ...rest) {
        if (request === 'electron') return stub;
        return originalLoad.call(this, request, ...rest);
    };
}

installElectronStub(E2E_USER_DATA);

const KEYCHAIN_SERVICE = 'com.v4amaral.copiloto';
const KEYCHAIN_ACCOUNT = 'v4-session';
const MARKER = '[E2E]';

// ---------------------------------------------------------------------------
// Modo filho: prova que a sessão salva no Keychain é restaurada num PROCESSO NOVO
// ---------------------------------------------------------------------------
if (IS_CHILD) {
    (async () => {
        try {
            const v4AuthService = require(path.join(PROJECT_ROOT, 'src/features/common/services/v4AuthService'));
            const state = await v4AuthService.getState();
            const uid = await v4AuthService.getUserId();
            console.log(`__E2E_CHILD__${JSON.stringify({ ok: true, loggedIn: state.loggedIn, email: state.email, uid })}`);
            process.exit(0);
        } catch (err) {
            console.log(`__E2E_CHILD__${JSON.stringify({ ok: false, error: err.message })}`);
            process.exit(1);
        }
    })();
    return;
}

// ---------------------------------------------------------------------------
// Runner de etapas
// ---------------------------------------------------------------------------
const results = [];

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

async function step(id, name, fn) {
    console.log(`\n──────── [${id}] ${name}`);
    try {
        const detail = await fn();
        results.push({ id, name, status: 'PASSOU', detail: detail || '' });
        console.log(`   ✅ PASSOU${detail ? ` — ${detail}` : ''}`);
        return true;
    } catch (err) {
        results.push({ id, name, status: 'FALHOU', detail: err.message });
        console.log(`   ❌ FALHOU — ${err.message}`);
        return false;
    }
}

function skip(id, name, reason) {
    results.push({ id, name, status: 'FALHOU', detail: `não executada: ${reason}` });
    console.log(`\n──────── [${id}] ${name}\n   ❌ FALHOU — não executada: ${reason}`);
}

const SECONDS_FLOOR = 1_500_000_000; // 2017 — abaixo disso não é Unix seconds plausível

function assertUnixSeconds(label, value) {
    assert(Number.isInteger(value), `${label} deveria ser inteiro, veio ${typeof value} (${value})`);
    const ceiling = Math.floor(Date.now() / 1000) + 86400;
    assert(
        value > SECONDS_FLOOR && value < ceiling,
        `${label}=${value} fora da faixa de Unix seconds (provável milissegundos ou valor inválido)`
    );
}

function permissionsOf(doc) {
    return doc.$permissions || [];
}

function assertDocPermissions(label, doc, uid) {
    const perms = permissionsOf(doc);
    for (const verb of ['read', 'update', 'delete']) {
        const expected = `${verb}("user:${uid}")`;
        assert(perms.includes(expected), `${label}: falta permission ${expected} (veio: ${JSON.stringify(perms)})`);
    }
}

// ---------------------------------------------------------------------------
// Estado compartilhado entre etapas
// ---------------------------------------------------------------------------
const state = {
    uid: null,
    appwriteSessionId: null,
    sessionOnline: null,   // sessão da etapa 3/4
    sessionOffline: null,  // sessão da etapa 6
    keychainBackup: undefined, // undefined = ainda não lido; null = não existia
    createdSessionIds: [],
};

let keytar;
let admin = { databases: null, users: null };

async function backupKeychain() {
    keytar = require('keytar');
    state.keychainBackup = await keytar.getPassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT);
}

async function restoreKeychain() {
    if (state.keychainBackup === undefined) return 'nada a restaurar (backup não chegou a ser lido)';
    try {
        if (state.keychainBackup) {
            await keytar.setPassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT, state.keychainBackup);
            return 'sessão original do usuário restaurada no Keychain';
        }
        await keytar.deletePassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT);
        return 'Keychain devolvido ao estado original (sem sessão)';
    } catch (err) {
        return `FALHA ao restaurar o Keychain: ${err.message}`;
    }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
    const { Client, Databases, Users, Query } = require('node-appwrite');

    const ENDPOINT = process.env.APPWRITE_ENDPOINT;
    const PROJECT_ID = process.env.APPWRITE_PROJECT_ID;
    const API_KEY = process.env.APPWRITE_API_KEY;
    const EMAIL = process.env.E2E_EMAIL || 'vinicius.mercante@v4company.com';
    const PASSWORD = process.env.E2E_PASSWORD;

    console.log('════════════════════════════════════════════════════════════');
    console.log(' E2E — Migração Appwrite (Copiloto V4)');
    console.log('════════════════════════════════════════════════════════════');
    console.log(` endpoint : ${ENDPOINT || '(ausente)'}`);
    console.log(` projeto  : ${PROJECT_ID || '(ausente)'}`);
    console.log(` api key  : ${API_KEY ? 'presente' : '(ausente)'}`);
    console.log(` closer   : ${EMAIL}`);
    console.log(` senha    : ${PASSWORD ? 'presente (via E2E_PASSWORD)' : '(ausente)'}`);
    console.log(` userData : ${E2E_USER_DATA} (isolado — o banco real não é tocado)`);

    if (!ENDPOINT || !PROJECT_ID || !API_KEY) {
        console.error('\n❌ Faltam APPWRITE_ENDPOINT / APPWRITE_PROJECT_ID / APPWRITE_API_KEY no .env da raiz.');
        process.exit(2);
    }
    if (!PASSWORD) {
        console.error('\n❌ E2E_PASSWORD não definida. Rode:');
        console.error("   E2E_PASSWORD='...' ELECTRON_RUN_AS_NODE=1 ./node_modules/.bin/electron scripts/appwrite/e2e-migration.js");
        process.exit(2);
    }

    const adminClient = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
    admin.databases = new Databases(adminClient);
    admin.users = new Users(adminClient);

    const appwriteClient = require(path.join(PROJECT_ROOT, 'src/features/common/services/appwriteClient'));
    const { DATABASE_ID } = appwriteClient;
    const v4AuthService = require(path.join(PROJECT_ROOT, 'src/features/common/services/v4AuthService'));

    // --- Etapa 0: backup do Keychain e userData limpo -----------------------
    const ok0 = await step('0', 'Preparação (backup do Keychain + userData isolado)', async () => {
        await backupKeychain();
        fs.rmSync(E2E_USER_DATA, { recursive: true, force: true });
        fs.mkdirSync(E2E_USER_DATA, { recursive: true });
        return `sessão pré-existente no Keychain: ${state.keychainBackup ? 'sim (será restaurada no fim)' : 'não'}`;
    });
    if (!ok0) {
        printSummary();
        process.exit(1);
    }

    // A partir daqui tudo roda sob try/finally para o Keychain sempre voltar ao normal.
    try {
        // --- Etapa 1: login ------------------------------------------------
        const ok1 = await step('1', 'Login no Appwrite (e-mail/senha via v4AuthService)', async () => {
            const res = await v4AuthService.login(EMAIL, PASSWORD);
            assert(res.success, `login falhou: ${res.error}`);
            assert(res.email === EMAIL, `e-mail devolvido (${res.email}) difere do enviado`);
            const st = await v4AuthService.getState();
            assert(st.loggedIn, 'getState() não reporta loggedIn após o login');
            state.uid = await v4AuthService.getUserId();
            assert(state.uid, 'getUserId() devolveu null após o login');
            return `logado como ${st.email} (uid ${state.uid})`;
        });

        if (!ok1) {
            for (const [id, name] of [
                ['2', 'Sessão persistida no Keychain e restaurada em processo novo'],
                ['3', 'Sessão de escuta + transcrições pelo caminho real dos services'],
                ['4', 'Encerrar sessão e disparar o upload pós-call'],
                ['5', 'Documentos no Appwrite: permissions por documento e Unix seconds'],
                ['6', 'Fila offline: falha → enfileira → restaura → reenvia'],
                ['7', 'Sessão revogada no servidor: queda limpa pelo 401'],
                ['8', 'Logout'],
            ]) skip(id, name, 'login falhou');
            return;
        }

        // --- Etapa 2: persistência no Keychain + processo novo --------------
        await step('2', 'Sessão persistida no Keychain e restaurada em processo novo', async () => {
            const raw = await keytar.getPassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT);
            assert(raw, 'nada foi gravado no Keychain após o login');
            const stored = JSON.parse(raw);
            assert(typeof stored.secret === 'string' && stored.secret.length > 0, 'a entrada do Keychain não tem session secret');
            assert(stored.uid === state.uid, 'uid do Keychain difere do uid da sessão em memória');

            const child = spawnSync(process.execPath, [__filename, '--child-restore'], {
                env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
                encoding: 'utf8',
                timeout: 60_000,
            });
            const line = (child.stdout || '').split('\n').find(l => l.startsWith('__E2E_CHILD__'));
            assert(line, `processo filho não devolveu resultado (stderr: ${(child.stderr || '').trim().slice(-300)})`);
            const childState = JSON.parse(line.replace('__E2E_CHILD__', ''));
            assert(childState.ok, `processo filho falhou: ${childState.error}`);
            assert(childState.loggedIn, 'processo filho não restaurou a sessão do Keychain');
            assert(childState.email === EMAIL, `processo filho restaurou outro e-mail (${childState.email})`);
            assert(childState.uid === state.uid, 'processo filho restaurou outro uid');
            return `processo novo (pid separado) restaurou ${childState.email} e validou contra o servidor`;
        });

        // --- Boot local (SQLite + authService), como o index.js faz ---------
        const databaseInitializer = require(path.join(PROJECT_ROOT, 'src/features/common/services/databaseInitializer'));
        const authService = require(path.join(PROJECT_ROOT, 'src/features/common/services/authService'));
        const sessionRepository = require(path.join(PROJECT_ROOT, 'src/features/common/repositories/session'));
        const sttRepository = require(path.join(PROJECT_ROOT, 'src/features/listen/stt/repositories'));
        const v4SyncService = require(path.join(PROJECT_ROOT, 'src/features/common/services/v4SyncService'));

        await databaseInitializer.initialize();
        await authService.initialize();

        const TURNS = [
            { speaker: 'Me', text: `${MARKER} Bom dia, obrigado por reservar esse tempo.` },
            { speaker: 'Them', text: `${MARKER} Bom dia! Me conta como funciona o produto.` },
            { speaker: 'Me', text: `${MARKER} Ele escuta a call e sugere respostas em tempo real.` },
        ];

        // --- Etapa 3: sessão de escuta + transcrições -----------------------
        const ok3 = await step('3', 'Sessão de escuta + transcrições pelo caminho real dos services', async () => {
            const sessionId = await sessionRepository.getOrCreateActive('listen');
            assert(sessionId, 'getOrCreateActive não devolveu sessionId');
            state.sessionOnline = sessionId;
            state.createdSessionIds.push(sessionId);
            await sessionRepository.updateTitle(sessionId, `${MARKER} sessão online`);

            for (const turn of TURNS) {
                // mesmo par de chamadas de listenService.saveConversationTurn
                await sessionRepository.touch(sessionId);
                await sttRepository.addTranscript({ sessionId, speaker: turn.speaker, text: turn.text });
            }

            const rows = await sttRepository.getAllTranscriptsBySessionId(sessionId);
            assert(rows.length === TURNS.length, `esperava ${TURNS.length} transcrições no SQLite, achei ${rows.length}`);
            rows.forEach(r => assertUnixSeconds('transcripts.start_at (SQLite)', r.start_at));
            return `session ${sessionId} com ${rows.length} turnos no SQLite`;
        });

        // --- Etapa 4: encerrar + upload ------------------------------------
        const ok4 = ok3 && await step('4', 'Encerrar sessão e disparar o upload pós-call', async () => {
            // mesma sequência de listenService.closeSession()
            await sessionRepository.end(state.sessionOnline);
            const local = await sessionRepository.getById(state.sessionOnline);
            assert(local.ended_at, 'ended_at não foi gravado no SQLite');

            const res = await v4SyncService.uploadSession(state.sessionOnline);
            assert(res.success, `upload falhou: ${res.error}`);
            assert(res.turns === TURNS.length, `upload reportou ${res.turns} turnos, esperava ${TURNS.length}`);
            return `${res.turns} turnos enviados ao Appwrite`;
        });

        // --- Etapa 5: verificação no servidor ------------------------------
        await (ok4 ? step('5', 'Documentos no Appwrite: permissions por documento e Unix seconds', async () => {
            const doc = await admin.databases.getDocument({
                databaseId: DATABASE_ID, collectionId: 'sessions', documentId: state.sessionOnline,
            });
            assert(doc.uid === state.uid, `sessions.uid=${doc.uid} difere do closer logado`);
            assertUnixSeconds('sessions.started_at', doc.started_at);
            assertUnixSeconds('sessions.ended_at', doc.ended_at);
            assertUnixSeconds('sessions.updated_at', doc.updated_at);
            assertDocPermissions('sessions', doc, state.uid);

            const list = await admin.databases.listDocuments({
                databaseId: DATABASE_ID,
                collectionId: 'transcripts',
                queries: [Query.equal('session_id', state.sessionOnline), Query.limit(100)],
            });
            assert(list.total === TURNS.length, `esperava ${TURNS.length} transcripts no Appwrite, achei ${list.total}`);
            for (const t of list.documents) {
                assert(t.uid === state.uid, `transcripts.uid=${t.uid} difere do closer logado`);
                assertUnixSeconds('transcripts.start_at', t.start_at);
                assertUnixSeconds('transcripts.created_at', t.created_at);
                assertUnixSeconds('transcripts.updated_at', t.updated_at);
                assertDocPermissions('transcripts', t, state.uid);
            }
            const textos = list.documents.map(d => d.text).sort();
            const esperados = TURNS.map(t => t.text).sort();
            assert(JSON.stringify(textos) === JSON.stringify(esperados), 'os textos no Appwrite não batem com os do SQLite');
            return `1 sessão + ${list.total} transcripts com read/update/delete de user:${state.uid} e timestamps em segundos`;
        }) : skip('5', 'Documentos no Appwrite: permissions por documento e Unix seconds', 'upload não ocorreu'));

        // --- Etapa 6: fila offline -----------------------------------------
        const queuePath = path.join(E2E_USER_DATA, 'upload-queue.json');
        const readQueue = () => { try { return JSON.parse(fs.readFileSync(queuePath, 'utf8')); } catch (_) { return []; } };

        await step('6', 'Fila offline: falha → enfileira → restaura → reenvia', async () => {
            const sessionId = await sessionRepository.getOrCreateActive('listen');
            state.sessionOffline = sessionId;
            state.createdSessionIds.push(sessionId);
            await sessionRepository.updateTitle(sessionId, `${MARKER} sessão offline`);
            const offlineTurns = [
                { speaker: 'Me', text: `${MARKER} Esse turno cai na fila offline.` },
                { speaker: 'Them', text: `${MARKER} E volta no próximo boot.` },
            ];
            for (const turn of offlineTurns) {
                await sessionRepository.touch(sessionId);
                await sttRepository.addTranscript({ sessionId, speaker: turn.speaker, text: turn.text });
            }
            await sessionRepository.end(sessionId);

            // Injeção controlada: derruba só o transporte, o resto do fluxo é real.
            const databases = appwriteClient.getDatabasesInstance();
            const originalCreate = databases.createDocument.bind(databases);
            databases.createDocument = async () => {
                const err = new Error('fetch failed (falha de rede simulada pelo E2E)');
                err.code = 0;
                throw err;
            };

            let failed;
            try {
                failed = await v4SyncService.uploadSession(sessionId);
            } finally {
                databases.createDocument = originalCreate;
            }
            assert(!failed.success, 'o upload deveria ter falhado com a rede derrubada');

            const queued = readQueue();
            assert(queued.includes(sessionId), `a sessão não entrou na fila (${queuePath}: ${JSON.stringify(queued)})`);

            // Rede de volta: mesmo caminho do boot (index.js chama retryPending)
            await v4SyncService.retryPending();

            const after = readQueue();
            assert(!after.includes(sessionId), `a sessão continuou na fila após o reenvio: ${JSON.stringify(after)}`);

            const list = await admin.databases.listDocuments({
                databaseId: DATABASE_ID,
                collectionId: 'transcripts',
                queries: [Query.equal('session_id', sessionId), Query.limit(100)],
            });
            assert(list.total === offlineTurns.length, `após o reenvio esperava ${offlineTurns.length} transcripts, achei ${list.total}`);
            const sess = await admin.databases.getDocument({
                databaseId: DATABASE_ID, collectionId: 'sessions', documentId: sessionId,
            });
            assertDocPermissions('sessions (reenviada)', sess, state.uid);
            return `falhou → 1 na fila → retryPending() reenviou ${list.total} transcripts e esvaziou a fila`;
        });

        // --- Etapa 7: revogação no servidor → 401 --------------------------
        await step('7', 'Sessão revogada no servidor: queda limpa pelo 401', async () => {
            const current = await appwriteClient.getAccountInstance().getSession({ sessionId: 'current' });
            state.appwriteSessionId = current.$id;

            // revoga SOMENTE a sessão deste teste; as demais do usuário seguem válidas
            await admin.users.deleteSession({ userId: state.uid, sessionId: current.$id });

            let got401 = false;
            try {
                await appwriteClient.getAccountInstance().get();
            } catch (err) {
                got401 = err?.code === 401;
                if (!got401) throw new Error(`esperava 401 após a revogação, veio ${err?.code}: ${err.message}`);
            }
            assert(got401, 'a chamada seguinte à revogação não devolveu 401');

            await new Promise(r => setTimeout(r, 500)); // interceptor roda em setImmediate

            const st = await v4AuthService.getState();
            assert(!st.loggedIn, 'o serviço continuou reportando loggedIn após o 401');
            const raw = await keytar.getPassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT);
            assert(!raw, 'a sessão inválida continuou no Keychain após o 401');
            return 'interceptor derrubou a sessão e limpou o Keychain sem exceção vazando';
        });

        // --- Etapa 8: logout ------------------------------------------------
        await step('8', 'Logout (novo login → logout → sessão some do servidor)', async () => {
            const relogin = await v4AuthService.login(EMAIL, PASSWORD);
            assert(relogin.success, `re-login falhou: ${relogin.error}`);
            const current = await appwriteClient.getAccountInstance().getSession({ sessionId: 'current' });
            const sessionId = current.$id;

            const res = await v4AuthService.logout();
            assert(res.success, 'logout não reportou sucesso');

            const st = await v4AuthService.getState();
            assert(!st.loggedIn, 'getState() ainda reporta loggedIn após o logout');
            const raw = await keytar.getPassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT);
            assert(!raw, 'a sessão continuou no Keychain após o logout');

            const sessions = await admin.users.listSessions({ userId: state.uid });
            const ainda = (sessions.sessions || []).some(s => s.$id === sessionId);
            assert(!ainda, 'a sessão continuou ativa no servidor após o logout');
            return 'sessão apagada no servidor e no Keychain (outras sessões do usuário preservadas)';
        });
    } finally {
        // --- Etapa 9: limpeza ------------------------------------------------
        await step('9', 'Limpeza (documentos de teste + Keychain original)', async () => {
            const { Query } = require('node-appwrite');
            const appwriteClient = require(path.join(PROJECT_ROOT, 'src/features/common/services/appwriteClient'));
            const { DATABASE_ID } = appwriteClient;
            const notas = [];

            let apagados = { sessions: 0, transcripts: 0 };
            if (state.uid) {
                try {
                    // varre também órfãos de execuções anteriores (marcador no título)
                    const all = await admin.databases.listDocuments({
                        databaseId: DATABASE_ID,
                        collectionId: 'sessions',
                        queries: [Query.equal('uid', state.uid), Query.limit(100)],
                    });
                    const alvos = new Set(state.createdSessionIds);
                    all.documents.filter(d => (d.title || '').startsWith(MARKER)).forEach(d => alvos.add(d.$id));

                    for (const sid of alvos) {
                        const ts = await admin.databases.listDocuments({
                            databaseId: DATABASE_ID,
                            collectionId: 'transcripts',
                            queries: [Query.equal('session_id', sid), Query.limit(100)],
                        });
                        for (const t of ts.documents) {
                            await admin.databases.deleteDocument({
                                databaseId: DATABASE_ID, collectionId: 'transcripts', documentId: t.$id,
                            });
                            apagados.transcripts++;
                        }
                        try {
                            await admin.databases.deleteDocument({
                                databaseId: DATABASE_ID, collectionId: 'sessions', documentId: sid,
                            });
                            apagados.sessions++;
                        } catch (err) {
                            if (err?.code !== 404) throw err;
                        }
                    }
                    notas.push(`Appwrite: ${apagados.sessions} sessions + ${apagados.transcripts} transcripts apagados`);
                } catch (err) {
                    notas.push(`FALHA ao limpar o Appwrite: ${err.message}`);
                }
            }

            try {
                const databaseInitializer = require(path.join(PROJECT_ROOT, 'src/features/common/services/databaseInitializer'));
                databaseInitializer.close();
            } catch (_) { /* nunca chegou a abrir */ }
            fs.rmSync(E2E_USER_DATA, { recursive: true, force: true });
            notas.push('userData de teste removido');

            notas.push(await restoreKeychain());
            const nota = notas.join('; ');
            if (/FALHA/.test(nota)) throw new Error(nota);
            return nota;
        });
    }
}

function printSummary() {
    const falhas = results.filter(r => r.status === 'FALHOU');
    console.log('\n════════════════════════════════════════════════════════════');
    console.log(' RESUMO');
    console.log('════════════════════════════════════════════════════════════');
    for (const r of results) {
        const icon = r.status === 'PASSOU' ? '✅' : '❌';
        console.log(`${icon} [${r.id}] ${r.status.padEnd(6)} ${r.name}`);
        if (r.detail) console.log(`        ${r.detail}`);
    }
    console.log('────────────────────────────────────────────────────────────');
    console.log(` ${results.length - falhas.length}/${results.length} etapas passaram.`);
    console.log(falhas.length === 0 ? ' RESULTADO: PASSOU' : ` RESULTADO: FALHOU (${falhas.map(f => f.id).join(', ')})`);
    return falhas.length;
}

// Ctrl-C / kill: o Keychain do usuário precisa voltar mesmo assim.
let interrompendo = false;
for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, async () => {
        if (interrompendo) return;
        interrompendo = true;
        console.log(`\n⚠️  ${sig} recebido — restaurando o Keychain antes de sair...`);
        console.log(`   ${await restoreKeychain()}`);
        process.exit(130);
    });
}

main()
    .then(() => {
        process.exit(printSummary() === 0 ? 0 : 1);
    })
    .catch(async err => {
        console.error('\n💥 Erro não tratado no harness:', err.message);
        console.error(err.stack);
        console.log(`   ${await restoreKeychain()}`);
        printSummary();
        process.exit(1);
    });
