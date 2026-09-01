// Configuração da infraestrutura Appwrite self-hosted do Copiloto V4.
// Substitui o papel do v4Config (Supabase) a partir da migração (passo 2+).
// Env vars sobrescrevem os defaults — mesmo padrão do v4Config — para apontar
// o app para outro servidor/projeto (ambientes de teste ou instância do cliente).

const APPWRITE_ENDPOINT = process.env.APPWRITE_ENDPOINT || 'https://appwrite.v4companyamaral.com/v1';

const APPWRITE_PROJECT_ID = process.env.APPWRITE_PROJECT_ID || '6a94c150000c9aabb8c5';

// 'copiloto' (white-label): o database 'pickleglass' herdado do Glass foi abandonado.
const APPWRITE_DATABASE_ID = process.env.APPWRITE_DATABASE_ID || 'copiloto';

module.exports = {
    APPWRITE_ENDPOINT,
    APPWRITE_PROJECT_ID,
    APPWRITE_DATABASE_ID,
};
