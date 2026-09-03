#!/usr/bin/env node
/**
 * E2E — Times / empresa (docs/TIMES.md), contra o Appwrite self-hosted REAL.
 *
 * Exercita o v4TeamService e o v4SyncService de verdade, com contas descartáveis:
 * o gestor cria o time, convida dois closers, o closer grava uma sessão com
 * transcrição, o gestor lê e conversa com a reunião, o outro closer NÃO lê nada,
 * e a remoção do membro revoga a leitura.
 *
 * ---------------------------------------------------------------------------
 * O QUE ESTE TESTE **NÃO** COBRE
 * ---------------------------------------------------------------------------
 *  · A UI (renderer) e o preload: rodamos como Node puro com stub de `electron`.
 *  · O clique real no link do convite: o secret da membership só chega por e-mail.
 *    O aceite é feito por via administrativa (POST /memberships com userId, que já
 *    nasce confirmado) — mesmo efeito final do clique. A rota pública de status é
 *    provada indiretamente: com API key ela devolve 401 (é rota public), que é
 *    exatamente por isso que o aceite mora na página web.
 *  · A página web-pages/convite/index.html: HTML estático, conferido no navegador
 *    e por `curl` depois do deploy.
 *
 * ---------------------------------------------------------------------------
 * COMO RODAR
 * ---------------------------------------------------------------------------
 *   ELECTRON_RUN_AS_NODE=1 ./node_modules/.bin/electron scripts/appwrite/e2e-times.js
 *
 * Precisa do .env da raiz (APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY).
 * A API key é usada só para criar/apagar as contas de teste e simular o aceite.
 *
 * ---------------------------------------------------------------------------
 * SEGURANÇA E EFEITOS COLATERAIS
 * ---------------------------------------------------------------------------
 *  · Nunca imprime senha, secret ou API key.
 *  · Contas, time e documentos criados são APAGADOS no finally, mesmo em falha.
 *  · O Keychain do usuário é salvo no início e restaurado no fim — o teste faz
 *    login com contas de teste no mesmo serviço de Keychain que o app usa.
 *  · Idempotente: cada execução usa e-mails novos e não deixa resíduo.
 */

const fs = require('fs');
const path = require('path');
const Module = require('module');

const PROJETO = path.resolve(__dirname, '../..');

const caminhoEnv = path.join(PROJETO, '.env');
if (!fs.existsSync(caminhoEnv)) {
    console.error('FALHOU: .env não encontrado na raiz do projeto.');
    process.exit(1);
}
for (const linha of fs.readFileSync(caminhoEnv, 'utf8').split('\n')) {
    const i = linha.indexOf('=');
    if (i > 0 && !linha.trim().startsWith('#')) {
        process.env[linha.slice(0, i).trim()] = linha.slice(i + 1).trim();
    }
}
if (!process.env.APPWRITE_API_KEY) {
    console.error('FALHOU: APPWRITE_API_KEY ausente no .env (necessária para a limpeza).');
    process.exit(1);
}

// Stub do módulo `electron`: fora do main process não há janelas para notificar.
const stubElectron = {
    BrowserWindow: { getAllWindows: () => [] },
    app: { getPath: () => require('os').tmpdir(), getVersion: () => '0.0.0-e2e', isPackaged: false, on: () => {} },
};
const carregarOriginal = Module._load;
Module._load = function (pedido, ...resto) {
    if (pedido === 'electron') return stubElectron;
    return carregarOriginal.call(this, pedido, ...resto);
};

const keytar = require('keytar');
const v4AuthService = require(path.join(PROJETO, 'src/features/common/services/v4AuthService.js'));
const v4TeamService = require(path.join(PROJETO, 'src/features/common/services/v4TeamService.js'));
const v4SyncService = require(path.join(PROJETO, 'src/features/common/services/v4SyncService.js'));
const askService = require(path.join(PROJETO, 'src/features/ask/askService.js'));
const { papelDoCloser } = v4TeamService;

const KEYCHAIN_SERVICE = 'com.v4amaral.copiloto';
const KEYCHAIN_ACCOUNT = 'v4-session';
const DB = process.env.APPWRITE_DATABASE_ID || 'copiloto';

const ts = Date.now();
const SENHA = 'TimesE2E-' + Math.random().toString(36).slice(2, 10) + '!A1';
const GESTOR = { email: `e2e-times-gestor-${ts}@v4company.com`, nome: 'Gestor E2E' };
const CLOSER = { email: `e2e-times-closer-${ts}@v4company.com`, nome: 'Closer E2E' };
const OUTRO = { email: `e2e-times-outro-${ts}@v4company.com`, nome: 'Outro Closer E2E' };

let backupKeychain = null;
let falhas = 0;
const lixo = { users: [], teams: [], docs: [] };

function passo(nome, ok, detalhe) {
    console.log(`${ok ? 'PASSOU' : 'FALHOU'}  ${nome}${detalhe ? ' :: ' + detalhe : ''}`);
    if (!ok) falhas++;
}

/** Chamada administrativa (API key) — criação/limpeza das contas e aceite do convite. */
function admin(caminho, metodo, corpo) {
    return fetch(`${process.env.APPWRITE_ENDPOINT}${caminho}`, {
        method: metodo,
        headers: {
            'Content-Type': 'application/json',
            'X-Appwrite-Project': process.env.APPWRITE_PROJECT_ID,
            'X-Appwrite-Key': process.env.APPWRITE_API_KEY,
        },
        body: corpo ? JSON.stringify(corpo) : undefined,
    });
}

const comoJson = async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) });

/** Entra como uma das contas de teste (o serviço real cuida do cookie/Keychain). */
async function entrarComo(conta) {
    const r = await v4AuthService.logout().catch(() => {});
    const login = await v4AuthService.login(conta.email, SENHA);
    if (!login.success) throw new Error(`login falhou para ${conta.email}: ${login.error}`);
    return r;
}

async function restaurarKeychain() {
    try {
        if (backupKeychain) {
            await keytar.setPassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT, backupKeychain);
            console.log('Keychain do usuário restaurado.');
        } else {
            await keytar.deletePassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT);
        }
    } catch (_) { /* best-effort */ }
}

for (const sinal of ['SIGINT', 'SIGTERM']) {
    process.on(sinal, async () => {
        console.log(`\n${sinal} recebido — restaurando Keychain antes de sair.`);
        await restaurarKeychain();
        process.exit(130);
    });
}

(async () => {
    try {
        backupKeychain = await keytar.getPassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT);
        console.log(`Keychain do usuário: ${backupKeychain ? 'salvo para restaurar' : 'vazio'}\n`);

        // ---------- contas descartáveis ----------
        for (const conta of [GESTOR, CLOSER, OUTRO]) {
            const r = await comoJson(await admin('/users', 'POST', {
                userId: 'unique()', email: conta.email, password: SENHA, name: conta.nome,
            }));
            if (r.status >= 300) throw new Error(`não criou ${conta.email}: ${JSON.stringify(r.body)}`);
            conta.uid = r.body.$id;
            lixo.users.push(conta.uid);
        }
        console.log('3 contas de teste criadas.\n');

        // ---------- 1. gestor cria o time ----------
        await entrarComo(GESTOR);
        const criado = await v4TeamService.createTeam(`Empresa E2E ${ts}`);
        passo('1. gestor cria a empresa', criado.success === true && !!criado.team?.id, criado.error || criado.team?.name);
        const teamId = criado.team?.id;
        if (!teamId) throw new Error('sem time — o resto do teste depende dele');
        lixo.teams.push(teamId);

        const meuTime = await v4TeamService.getMyTeam();
        passo('2. quem cria o time é gestor', meuTime.role === 'gestor', `papel=${meuTime.role}`);
        passo('3. estado do time fica junto do estado de conta',
            (await v4AuthService.getState())?.team?.id === teamId);

        // ---------- 4. convite ----------
        const convite = await v4TeamService.invite(CLOSER.email, 'closer');
        passo('4. gestor convida o closer por e-mail', convite.success === true, convite.error || convite.member?.status);
        const midCloser = convite.member?.membershipId;

        const conviteOutro = await v4TeamService.invite(OUTRO.email, 'closer');
        passo('5. segundo convite (outro closer)', conviteOutro.success === true, conviteOutro.error || '');

        const duplicado = await v4TeamService.invite(CLOSER.email, 'closer');
        passo('6. convite repetido é recusado com mensagem em pt-BR',
            duplicado.success === false && !!duplicado.code && /já/i.test(duplicado.error || ''), duplicado.error);

        // A rota pública de aceite não aceita API key — é por isso que o aceite mora na
        // página web. Provado aqui para o dia em que alguém tentar "simplificar".
        const statusComKey = await comoJson(await admin(
            `/teams/${teamId}/memberships/${midCloser}/status`, 'PATCH', { userId: CLOSER.uid, secret: 'x' }));
        passo('7. aceite com API key é recusado (rota public — por isso a página web)',
            statusComKey.status === 401, `HTTP ${statusComKey.status}`);

        // ---------- 8. aceite (via admin, mesmo efeito do clique no e-mail) ----------
        for (const conta of [CLOSER, OUTRO]) {
            // Remove o convite pendente e recria a membership já confirmada.
            const membros = await comoJson(await admin(`/teams/${teamId}/memberships`, 'GET'));
            const pendente = (membros.body.memberships || []).find(m => m.userId === conta.uid);
            if (pendente) await admin(`/teams/${teamId}/memberships/${pendente.$id}`, 'DELETE');
            const nova = await comoJson(await admin(`/teams/${teamId}/memberships`, 'POST', {
                userId: conta.uid, roles: ['closer', papelDoCloser(conta.uid)],
            }));
            conta.membershipId = nova.body.$id;
            conta.confirmado = nova.body.confirm === true;
        }
        passo('8. closers aceitam o convite (membership confirmada)',
            CLOSER.confirmado === true && OUTRO.confirmado === true);

        const depoisDoAceite = await v4TeamService.getMyTeam();
        passo('9. getMyTeam lista os 3 membros com papel e status',
            depoisDoAceite.members.length === 3 &&
            depoisDoAceite.members.filter(m => m.status === 'ativo').length === 3,
            depoisDoAceite.members.map(m => `${m.role}:${m.status}`).join(', '));

        // ---------- 10. closer grava uma sessão com transcrição ----------
        await entrarComo(CLOSER);
        await v4TeamService.getMyTeam(); // atualiza o estado do time no Keychain

        const estadoCloser = await v4AuthService.getTeamState();
        passo('10. closer enxerga o time no estado local',
            estadoCloser?.id === teamId && estadoCloser?.role === 'closer', JSON.stringify(estadoCloser));

        const sessionId = `e2e-times-sessao-${ts}`;
        const perms = await v4SyncService._permissoesDoDocumento(CLOSER.uid);
        const permsTexto = perms.map(String);
        passo('11. permissões do documento incluem o papel do closer (e NÃO "gestor")',
            permsTexto.some(p => p === `read("team:${teamId}/${papelDoCloser(CLOSER.uid)}")`) &&
            !permsTexto.some(p => p.includes('/gestor')),
            permsTexto.join(' '));

        const now = Math.floor(Date.now() / 1000);
        const criaSessao = await comoJson(await fetch(
            `${process.env.APPWRITE_ENDPOINT}/databases/${DB}/collections/sessions/documents`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Appwrite-Project': process.env.APPWRITE_PROJECT_ID,
                    'X-Appwrite-Response-Format': '1.7.0',
                    'X-Appwrite-Session': await v4AuthService.getSessionSecret(),
                },
                body: JSON.stringify({
                    documentId: sessionId,
                    data: {
                        uid: CLOSER.uid, team_id: teamId, title: 'Call E2E com a Acme',
                        session_type: 'listen', started_at: now - 600, ended_at: now, updated_at: now,
                    },
                    permissions: permsTexto,
                }),
            }));
        passo('12. closer grava a sessão com a permissão do time',
            criaSessao.status === 201, `HTTP ${criaSessao.status} ${criaSessao.body.message || ''}`);
        if (criaSessao.status === 201) lixo.docs.push(['sessions', sessionId]);

        const falas = [
            { speaker: 'me', text: 'Bom dia, obrigado pelo tempo. Vamos ao diagnóstico do comercial de vocês.' },
            { speaker: 'them', text: 'Bom dia. Hoje a gente investe pouco em marketing e o time comercial reclama de lead ruim.' },
            { speaker: 'me', text: 'Entendi. Qual o faturamento aproximado e quanto vocês investem por mês?' },
            { speaker: 'them', text: 'Faturamos cerca de dois milhões por ano e investimos uns cinco mil por mês.' },
            { speaker: 'me', text: 'Faz sentido. O preço do nosso trabalho parte de dez mil mensais.' },
            { speaker: 'them', text: 'O orçamento está apertado, mas se o retorno for claro a gente aprova.' },
        ];
        for (let i = 0; i < falas.length; i++) {
            const id = `e2e-times-t${i}-${ts}`;
            const r = await comoJson(await fetch(
                `${process.env.APPWRITE_ENDPOINT}/databases/${DB}/collections/transcripts/documents`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Appwrite-Project': process.env.APPWRITE_PROJECT_ID,
                        'X-Appwrite-Response-Format': '1.7.0',
                        'X-Appwrite-Session': await v4AuthService.getSessionSecret(),
                    },
                    body: JSON.stringify({
                        documentId: id,
                        data: {
                            uid: CLOSER.uid, session_id: sessionId, start_at: now - 600 + i * 30,
                            speaker: falas[i].speaker, text: falas[i].text, lang: 'pt-BR',
                            created_at: now, updated_at: now,
                        },
                        permissions: permsTexto,
                    }),
                }));
            if (r.status === 201) lixo.docs.push(['transcripts', id]);
        }
        passo('13. transcrição da call gravada na nuvem',
            lixo.docs.filter(([c]) => c === 'transcripts').length === falas.length);

        // ---------- 14-17. visão do gestor ----------
        await entrarComo(GESTOR);
        const doTime = await v4TeamService.teamSessions();
        const achada = (doTime.sessions || []).find(s => s.id === sessionId);
        passo('14. gestor LISTA a sessão do closer', doTime.success === true && !!achada,
            `${(doTime.sessions || []).length} sessão(ões)`);
        passo('15. a sessão vem com o dono resolvido (nome e e-mail)',
            achada?.owner?.email === CLOSER.email && !!achada?.owner?.name,
            `${achada?.owner?.name} <${achada?.owner?.email}>`);

        const transc = await v4TeamService.teamTranscripts(sessionId);
        passo('16. gestor LÊ a transcrição da call do closer',
            transc.success === true && transc.transcripts.length === falas.length,
            `${transc.transcripts?.length || 0} falas`);
        passo('17. o conteúdo é o que o closer gravou',
            (transc.transcripts || []).some(t => /orçamento está apertado/.test(t.text || '')));

        // ---------- 18-19. o outro closer NÃO enxerga ----------
        await entrarComo(OUTRO);
        const outroLista = await comoJson(await fetch(
            `${process.env.APPWRITE_ENDPOINT}/databases/${DB}/collections/sessions/documents/${sessionId}`, {
                headers: {
                    'X-Appwrite-Project': process.env.APPWRITE_PROJECT_ID,
                    'X-Appwrite-Response-Format': '1.7.0',
                    'X-Appwrite-Session': await v4AuthService.getSessionSecret(),
                },
            }));
        passo('18. outro closer do MESMO time não lê a sessão do colega',
            outroLista.status === 404, `HTTP ${outroLista.status}`);

        const outroTranscritos = await v4TeamService.teamTranscripts(sessionId);
        passo('19. outro closer não lê a transcrição do colega',
            outroTranscritos.success === false, outroTranscritos.error);

        const outroTentaListar = await v4TeamService.teamSessions();
        passo('20. teamSessions é recusado para quem não é gestor',
            outroTentaListar.success === false && outroTentaListar.code === 'sem_permissao',
            outroTentaListar.error);

        // ---------- 21-23. gestor conversa com a reunião do closer ----------
        await entrarComo(GESTOR);

        // LLM stubada: o teste é sobre permissões e persistência, não sobre o modelo.
        const modelStateService = require(path.join(PROJETO, 'src/features/common/services/modelStateService.js'));
        modelStateService.getCurrentModelInfo = async () => ({ provider: 'openai', model: 'gpt-4.1', apiKey: 'stub' });
        const factory = require(path.join(PROJETO, 'src/features/common/ai/factory.js'));
        let promptRecebido = null;
        factory.createStreamingLLM = () => ({
            streamChat: async (messages) => {
                promptRecebido = messages;
                const corpo = 'O lead disse que o orçamento estava apertado, mas aprovaria com retorno claro.';
                const stream = new ReadableStream({
                    start(c) {
                        c.enqueue(new TextEncoder().encode(
                            `data: ${JSON.stringify({ choices: [{ delta: { content: corpo } }] })}\n\n`));
                        c.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
                        c.close();
                    },
                });
                return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } });
            },
        });

        const conversa = await askService.askAboutSession({
            sessionId, question: 'O que o lead falou sobre preço?', source: 'cloud',
        });
        passo('21. gestor conversa com a reunião do closer (fonte cloud)',
            conversa.success === true && /orçamento/.test(conversa.response || ''), conversa.error || '');
        passo('22. o prompt levou a transcrição da NUVEM',
            !!promptRecebido && /orçamento está apertado/.test(promptRecebido[0]?.content || ''));

        const msgsGestor = await askService.getSessionAiMessages(sessionId, 'cloud');
        passo('23. pergunta e resposta ficaram na sessão do closer, na nuvem',
            msgsGestor.length === 2 && msgsGestor[0].role === 'user' && msgsGestor[1].role === 'assistant',
            `${msgsGestor.length} mensagens`);
        for (const m of msgsGestor) lixo.docs.push(['ai_messages', m.id]);

        await entrarComo(CLOSER);
        const msgsCloser = await v4TeamService.cloudAiMessages(sessionId);
        passo('24. o closer lê a conversa que o gestor teve sobre a call dele',
            msgsCloser.success === true && msgsCloser.messages.length === 2,
            `${msgsCloser.messages?.length || 0} mensagens`);

        // ---------- 25-27. remoção revoga a leitura ----------
        await entrarComo(GESTOR);
        const antesDaRemocao = await v4TeamService.teamSessions();
        passo('25. antes de remover, o gestor ainda vê a call',
            (antesDaRemocao.sessions || []).some(s => s.id === sessionId));

        const removido = await v4TeamService.removeMember(CLOSER.membershipId);
        passo('26. gestor remove o closer do time', removido.success === true, removido.error || removido.aviso || '');

        const leituraDepois = await comoJson(await fetch(
            `${process.env.APPWRITE_ENDPOINT}/databases/${DB}/collections/sessions/documents/${sessionId}`, {
                headers: {
                    'X-Appwrite-Project': process.env.APPWRITE_PROJECT_ID,
                    'X-Appwrite-Response-Format': '1.7.0',
                    'X-Appwrite-Session': await v4AuthService.getSessionSecret(),
                },
            }));
        passo('27. remover o membro REVOGA a leitura das calls dele',
            leituraDepois.status === 404, `HTTP ${leituraDepois.status}`);

        const listaFinal = await v4TeamService.teamSessions();
        passo('28. a call some da listagem do gestor',
            !(listaFinal.sessions || []).some(s => s.id === sessionId),
            `${(listaFinal.sessions || []).length} sessão(ões) restantes`);

        // ---------- 28b-28f. closer removido com estado ANTIGO não perde a call nem a sessão ----------
        // Cenário do bug: o gestor remove o closer enquanto o app dele está fechado. Ao
        // abrir, o estado guardado ainda diz "estou no time", e o envio pós-call tenta
        // conceder um papel que ele não tem mais.
        await entrarComo(CLOSER);
        await v4AuthService.setTeamState({ id: teamId, name: `Empresa E2E ${ts}`, role: 'closer' });
        const permsAntigas = (await v4SyncService._permissoesDoDocumento(CLOSER.uid)).map(String);
        passo('28b. estado antigo ainda concede o papel do time',
            permsAntigas.some(p => p.includes(`/${papelDoCloser(CLOSER.uid)}`)));

        // Pelo SDK, como o envio pós-call faz: o servidor recusa — e a sessão NÃO pode cair.
        const { getDatabasesInstance } = require(path.join(PROJETO, 'src/features/common/services/appwriteClient.js'));
        const docRemovido = `e2e-times-removido-${ts}`;
        const agora = Math.floor(Date.now() / 1000);
        const dadosRemovido = {
            uid: CLOSER.uid, title: 'Call depois de removido', session_type: 'listen',
            started_at: agora - 300, ended_at: agora, updated_at: agora,
        };
        let erroSdk = null;
        try {
            await getDatabasesInstance().createDocument({
                databaseId: DB, collectionId: 'sessions', documentId: docRemovido,
                data: dadosRemovido, permissions: permsAntigas,
            });
            lixo.docs.push(['sessions', docRemovido]);
        } catch (e) { erroSdk = e; }
        passo('28c. servidor recusa o papel do time para quem foi removido',
            erroSdk?.code === 401 && /Permissions must be one of/.test(erroSdk?.message || ''),
            erroSdk ? `${erroSdk.code} ${String(erroSdk.message).slice(0, 60)}` : 'documento foi aceito');

        await new Promise(r => setTimeout(r, 100)); // o interceptor de 401 dispara por setImmediate
        passo('28d. a sessão do closer continua válida (401 de permissão não desloga)',
            (await v4AuthService.getState()).loggedIn === true);

        const relido = await v4SyncService._relerTimeDoServidor();
        passo('28e. reler o time limpa o estado antigo',
            relido === null && (await v4AuthService.getTeamState()) === null);

        const soDono = v4SyncService._permissoesDoDono(CLOSER.uid).map(String);
        const semTime = await comoJson(await fetch(
            `${process.env.APPWRITE_ENDPOINT}/databases/${DB}/collections/sessions/documents`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Appwrite-Project': process.env.APPWRITE_PROJECT_ID,
                    'X-Appwrite-Response-Format': '1.7.0',
                    'X-Appwrite-Session': await v4AuthService.getSessionSecret(),
                },
                body: JSON.stringify({ documentId: docRemovido, data: dadosRemovido, permissions: soDono }),
            }));
        passo('28f. a call sobe com as permissões do dono (é o reenvio do uploadSession)',
            semTime.status === 201, `HTTP ${semTime.status} ${semTime.body.message || ''}`);
        if (semTime.status === 201) lixo.docs.push(['sessions', docRemovido]);

        // ---------- 29. sair do time ----------
        await entrarComo(OUTRO);
        const saiu = await v4TeamService.leave();
        passo('29. closer sai do time', saiu.success === true, saiu.error || '');
        passo('30. depois de sair, não há time no estado local',
            (await v4AuthService.getTeamState()) === null);

        await entrarComo(GESTOR);
        const gestorSai = await v4TeamService.leave();
        passo('31. gestor sozinho consegue sair (o time é apagado)', gestorSai.success === true, gestorSai.error || '');
    } catch (erro) {
        console.error('ERRO NÃO TRATADO:', erro.message);
        falhas++;
    } finally {
        try { await v4AuthService.logout(); } catch (_) {}

        for (const [col, id] of lixo.docs) {
            await admin(`/databases/${DB}/collections/${col}/documents/${id}`, 'DELETE').catch(() => {});
        }
        for (const t of lixo.teams) await admin(`/teams/${t}`, 'DELETE').catch(() => {});
        for (const u of lixo.users) await admin(`/users/${u}`, 'DELETE').catch(() => {});
        console.log(`\nlimpeza: ${lixo.docs.length} documento(s), ${lixo.teams.length} time(s) e ${lixo.users.length} conta(s) apagados.`);

        await restaurarKeychain();
        console.log(`\n${falhas === 0 ? 'TODOS OS PASSOS PASSARAM' : falhas + ' PASSO(S) FALHARAM'}`);
        process.exit(falhas === 0 ? 0 : 1);
    }
})();
