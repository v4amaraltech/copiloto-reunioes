#!/usr/bin/env node
/**
 * E2E — Jornada de conta do SaaS (cadastro, verificação, recuperação).
 *
 * Exercita o v4AuthService REAL contra o Appwrite self-hosted de verdade:
 * cria uma conta descartável, confere o login automático, dispara os e-mails de
 * verificação e recuperação (SMTP real), prova a troca de senha e apaga a conta
 * no fim. Complementa o e2e-migration.js, que cobre o fluxo de sincronização.
 *
 * ---------------------------------------------------------------------------
 * O QUE ESTE TESTE **NÃO** COBRE
 * ---------------------------------------------------------------------------
 *  · A UI (renderer): SignupHeader/LoginHeader/VerifyEmailHeader, IPC e preload
 *    não são exercitados. O harness roda como Node puro
 *    (ELECTRON_RUN_AS_NODE) com um stub do módulo `electron`.
 *  · O clique real no link do e-mail: o secret de recuperação só chega na caixa
 *    de entrada, então a etapa 9 prova apenas que um token inválido é recusado.
 *    A troca de senha em si é provada por via administrativa (etapas 10-12), que
 *    é o mesmo efeito final do que o link faz.
 *  · A entrega do e-mail: validamos que o servidor aceitou o pedido (201). Se a
 *    mensagem chegou à caixa de entrada, só a inspeção manual confirma.
 *  · As páginas de web-pages/: são HTML estático, testadas abrindo no navegador.
 *
 * ---------------------------------------------------------------------------
 * COMO RODAR
 * ---------------------------------------------------------------------------
 *   ELECTRON_RUN_AS_NODE=1 ./node_modules/.bin/electron scripts/appwrite/e2e-conta.js
 *
 * Precisa do .env da raiz com APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID e
 * APPWRITE_API_KEY (a API key só é usada para a limpeza e para simular o efeito
 * do link de recuperação).
 *
 * ---------------------------------------------------------------------------
 * SEGURANÇA E EFEITOS COLATERAIS
 * ---------------------------------------------------------------------------
 *  · Nunca imprime senha, secret ou API key.
 *  · A conta criada é descartável (e2e-conta-<timestamp>@v4company.com) e é
 *    APAGADA no bloco finally, inclusive se algum passo falhar.
 *  · O Keychain do usuário é salvo no início e restaurado no fim — o usuário usa
 *    o app de verdade e não pode perder a sessão dele por causa do teste.
 *  · Idempotente: cada execução usa um e-mail novo e não deixa resíduo.
 *
 * Sai com código != 0 se qualquer passo falhar.
 */

const fs = require('fs');
const path = require('path');
const Module = require('module');

const PROJETO = path.resolve(__dirname, '../..');

// .env da raiz (já no .gitignore)
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
const stubElectron = { BrowserWindow: { getAllWindows: () => [] } };
const carregarOriginal = Module._load;
Module._load = function (pedido, ...resto) {
    if (pedido === 'electron') return stubElectron;
    return carregarOriginal.call(this, pedido, ...resto);
};

const keytar = require('keytar');
const v4AuthService = require(path.join(PROJETO, 'src/features/common/services/v4AuthService.js'));

const KEYCHAIN_SERVICE = 'com.v4amaral.copiloto';
const KEYCHAIN_ACCOUNT = 'v4-session';

const EMAIL = `e2e-conta-${Date.now()}@v4company.com`;
const SENHA = 'SenhaE2E-' + Math.random().toString(36).slice(2, 10) + '!A1';
const SENHA_NOVA = 'NovaE2E-' + Math.random().toString(36).slice(2, 10) + '!B2';

let uid = null;
let backupKeychain = null;
let falhas = 0;

function passo(nome, ok, detalhe) {
    console.log(`${ok ? 'PASSOU' : 'FALHOU'}  ${nome}${detalhe ? ' :: ' + detalhe : ''}`);
    if (!ok) falhas++;
}

/** Chamada administrativa (API key) — só para limpeza e para simular o efeito do link. */
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

async function restaurarKeychain() {
    if (backupKeychain) {
        await keytar.setPassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT, backupKeychain);
        console.log('Keychain do usuário restaurado.');
    } else {
        try { await keytar.deletePassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT); } catch (_) {}
    }
}

// Ctrl+C não pode deixar a sessão do usuário destruída.
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

        // 1-2. cadastro com login automático
        const criada = await v4AuthService.createAccount(EMAIL, 'Conta E2E', SENHA);
        passo('1. createAccount cria a conta e já autentica',
            criada.success === true && criada.autenticado === true,
            JSON.stringify({ success: criada.success, autenticado: criada.autenticado }));

        uid = await v4AuthService.getUserId();
        const estado1 = await v4AuthService.getState();
        passo('2. getState traz logado + emailVerified=false',
            estado1.loggedIn === true && estado1.emailVerified === false,
            JSON.stringify(estado1));

        // 3-5. erros traduzidos para pt-BR
        const duplicado = await v4AuthService.createAccount(EMAIL, 'Dup', SENHA);
        passo('3. e-mail já cadastrado', duplicado.code === 'email_ja_cadastrado', duplicado.error);

        const curta = await v4AuthService.createAccount(`descarte-${Date.now()}@v4company.com`, 'X', '123');
        passo('4. senha curta', curta.code === 'senha_curta', curta.error);

        const invalido = await v4AuthService.createAccount('nao-e-email', 'X', SENHA);
        passo('5. e-mail inválido', invalido.code === 'email_invalido', invalido.error);

        // 6-8. e-mails (SMTP real)
        const verificacao = await v4AuthService.sendVerification();
        passo('6. sendVerification aceito pelo servidor', verificacao.success === true, JSON.stringify(verificacao));

        const recuperacao = await v4AuthService.sendRecovery(EMAIL);
        passo('7. sendRecovery aceito pelo servidor', recuperacao.success === true, JSON.stringify(recuperacao));

        const inexistente = await v4AuthService.sendRecovery(`naoexiste-${Date.now()}@v4company.com`);
        passo('8. recovery de e-mail inexistente é recusado', inexistente.code === 'email_nao_encontrado', inexistente.error);

        // 9. o secret real só chega por e-mail: aqui provamos a recusa do token inválido
        const tokenRuim = await v4AuthService.completeRecovery(uid, 'secret-invalido-de-teste', SENHA_NOVA);
        passo('9. completeRecovery recusa token inválido',
            tokenRuim.success === false && tokenRuim.code === 'link_invalido', tokenRuim.error);

        // 10-12. efeito final da recuperação: senha trocada, login novo vale, antigo não
        const troca = await admin(`/users/${uid}/password`, 'PATCH', { password: SENHA_NOVA });
        passo('10. senha trocada no servidor', troca.status === 200, `HTTP ${troca.status}`);

        await v4AuthService.logout();
        const loginNovo = await v4AuthService.login(EMAIL, SENHA_NOVA);
        passo('11. login com a senha nova funciona', loginNovo.success === true);

        const loginAntigo = await v4AuthService.login(EMAIL, SENHA);
        passo('12. senha antiga deixa de valer', loginAntigo.success === false);

        // 13. e-mail verificado reflete no estado que a UI lê
        await admin(`/users/${uid}/verification`, 'PATCH', { emailVerification: true });
        await v4AuthService.logout();
        await v4AuthService.login(EMAIL, SENHA_NOVA);
        const estado2 = await v4AuthService.getState();
        passo('13. getState reflete emailVerified=true', estado2.emailVerified === true, JSON.stringify(estado2));
    } catch (erro) {
        console.error('ERRO NÃO TRATADO:', erro.message);
        falhas++;
    } finally {
        try { await v4AuthService.logout(); } catch (_) {}
        if (uid) {
            const apagada = await admin(`/users/${uid}`, 'DELETE');
            console.log(`\nlimpeza: conta de teste apagada (HTTP ${apagada.status})`);
        }
        await restaurarKeychain();
        console.log(`\n${falhas === 0 ? 'TODOS OS PASSOS PASSARAM' : falhas + ' PASSO(S) FALHARAM'}`);
        process.exit(falhas === 0 ? 0 : 1);
    }
})();
