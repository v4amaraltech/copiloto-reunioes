const { Client, Databases, Account, ID, Query, Permission, Role } = require('node-appwrite');
const { APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_DATABASE_ID } = require('../config/appwriteConfig');

/**
 * Singleton de conexão com o Appwrite self-hosted (portado da branch
 * feat/appwrite-migration do repo de referência, adaptado ao appwriteConfig).
 *
 * Modos:
 *  - Sem credencial (client "anônimo"): usado só para createEmailPasswordSession.
 *  - Sessão de usuário: setSessionSecret(secret) após o login/restauração.
 *  - O app desktop NUNCA usa API key admin (essa vive só em scripts/Functions).
 *
 * O Appwrite é pull — não existe onAuthStateChanged. Sessão expirada/revogada
 * aparece como 401 em qualquer request; o interceptor abaixo dispara o
 * callback registrado (setOnAuthError) para o logout limpo, sem bloquear
 * nem recursar o request original.
 */

let client = null;
let databasesInstance = null;
let accountInstance = null;
let onAuthErrorCallback = null;

function setOnAuthError(callback) {
    onAuthErrorCallback = callback;
}

function interceptAuthErrors(c) {
    const originalCall = c.call.bind(c);
    c.call = async (...args) => {
        try {
            return await originalCall(...args);
        } catch (err) {
            if (err?.code === 401 && onAuthErrorCallback) {
                // dispara sem await: o logout limpo não pode bloquear/recursar o request
                setImmediate(() => onAuthErrorCallback(err));
            }
            throw err;
        }
    };
    return c;
}

function buildClient({ sessionSecret } = {}) {
    // pt-br: os e-mails que o Appwrite dispara (verificação, recuperação) saem
    // no idioma do pedido, não do usuário — sem isso chegam em inglês.
    const c = new Client().setEndpoint(APPWRITE_ENDPOINT).setProject(APPWRITE_PROJECT_ID).setLocale('pt-br');
    if (sessionSecret) {
        c.setSession(sessionSecret);
        interceptAuthErrors(c); // só sessões de usuário expiram
    }
    return c;
}

/** (Re)cria o client com a credencial de sessão dada (null = anônimo). */
function setSessionSecret(sessionSecret) {
    client = buildClient({ sessionSecret });
    databasesInstance = new Databases(client);
    accountInstance = new Account(client);
    return client;
}

function getAppwriteClient() {
    if (!client) setSessionSecret(null);
    return client;
}

function getDatabasesInstance() {
    getAppwriteClient();
    return databasesInstance;
}

function getAccountInstance() {
    getAppwriteClient();
    return accountInstance;
}

module.exports = {
    DATABASE_ID: APPWRITE_DATABASE_ID,
    setSessionSecret,
    setOnAuthError,
    getAppwriteClient,
    getDatabasesInstance,
    getAccountInstance,
    // re-export dos helpers do SDK para os consumidores não importarem node-appwrite direto
    ID,
    Query,
    Permission,
    Role,
};
