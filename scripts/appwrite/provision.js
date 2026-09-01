/**
 * PROVISION — Estrutura de dados do Copiloto V4 no Appwrite self-hosted.
 * (Passo 2 do docs/MIGRACAO-APPWRITE-LEVANTAMENTO.md; portado da branch
 * feat/appwrite-migration do repo v4amaraltech/copilotov4 e adaptado.)
 *
 * Cria database, collections, attributes, indexes e permissions via Server SDK,
 * e semeia os agentes de vendas padrão em default_presets.
 * IDEMPOTENTE: rodar N vezes não quebra nem duplica (409/"already exists" é
 * tolerado; seeds usam id fixo + update para manter o texto sincronizado).
 * Ao final roda um smoke test: cria, lê e apaga um documento em cada collection.
 *
 * Modelo (todo doc carrega `uid`; transcripts/ai_messages/summaries carregam
 * `session_id`):
 *   users, sessions, transcripts, ai_messages, summaries, prompt_presets
 *     → documentSecurity, permissions por documento setadas na criação
 *   default_presets → leitura pública (Role.any()), escrita só admin (API key)
 *
 * Campos criptografados (ciphertext, dimensionados com folga):
 *   sessions.title · transcripts.text · ai_messages.content ·
 *   summaries.{text,tldr,bullet_json,action_json} · prompt_presets.{title,prompt}
 * Timestamps: Unix seconds (integer), padrão interno do app.
 *
 * COMO RODAR (credenciais no .env — APPWRITE_ENDPOINT/PROJECT_ID/API_KEY):
 *   node -r dotenv/config scripts/appwrite/provision.js
 */

const { Client, Databases, Permission, Role, ID } = require('node-appwrite');
const { APPWRITE_DATABASE_ID } = require('../../src/features/common/config/appwriteConfig');

const ENDPOINT = process.env.APPWRITE_ENDPOINT;
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID;
const API_KEY = process.env.APPWRITE_API_KEY;

if (!ENDPOINT || !PROJECT_ID || !API_KEY) {
    console.error('❌ Faltam variáveis de ambiente (APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY).');
    console.error('   Preencha o .env e rode: node -r dotenv/config scripts/appwrite/provision.js');
    process.exit(1);
}

const DB_ID = APPWRITE_DATABASE_ID; // 'copiloto' (white-label)

// ---------------------------------------------------------------------------
// Schema — conferido campo a campo contra src/features/common/config/schema.js
// (SQLite deste projeto). Colunas locais não sobem: sync_state (controle de
// sync por linha) e users.has_migrated_to_firebase (artefato legado).
// ---------------------------------------------------------------------------
const str = (key, size, required = false, array = false) => ({ kind: 'string', key, size, required, array });
const int = (key, required = false) => ({ kind: 'integer', key, required });
const bool = (key, xdefault = null) => ({ kind: 'boolean', key, xdefault });

const COLLECTIONS = [
    {
        id: 'users', // $id do documento = uid do usuário
        userOwned: true,
        attributes: [
            str('display_name', 255, true),
            str('email', 320, true),
            int('created_at'),
            int('updated_at'), // o converter grava updated_at em todo write
            bool('auto_update_enabled', true),
        ],
        indexes: [],
    },
    {
        id: 'sessions',
        userOwned: true,
        attributes: [
            str('uid', 64, true),
            str('members', 64, false, true), // array — sharing futuro
            str('title', 2048),              // criptografado
            str('session_type', 32),
            int('started_at'),
            int('ended_at'),
            int('updated_at'),
        ],
        indexes: [
            { key: 'idx_uid', attributes: ['uid'] },
            { key: 'idx_uid_ended', attributes: ['uid', 'ended_at'] },
            { key: 'idx_started', attributes: ['started_at'], orders: ['DESC'] },
            { key: 'idx_members', attributes: ['members'], optional: true },
        ],
    },
    {
        id: 'transcripts',
        userOwned: true,
        attributes: [
            str('uid', 64, true),
            str('session_id', 36, true),
            int('start_at'),
            int('end_at'),
            str('speaker', 64),
            str('text', 65535), // criptografado, pode ser longo
            str('lang', 16),
            int('created_at'),
            int('updated_at'),
        ],
        indexes: [
            { key: 'idx_session_start', attributes: ['session_id', 'start_at'] },
            { key: 'idx_uid', attributes: ['uid'] },
        ],
    },
    {
        id: 'ai_messages',
        userOwned: true,
        attributes: [
            str('uid', 64, true),
            str('session_id', 36, true),
            int('sent_at'),
            str('role', 32),
            str('content', 65535), // criptografado
            int('tokens'),
            str('model', 128),
            int('created_at'),
            int('updated_at'),
        ],
        indexes: [
            { key: 'idx_session_sent', attributes: ['session_id', 'sent_at'] },
            { key: 'idx_uid', attributes: ['uid'] },
        ],
    },
    {
        id: 'summaries', // 1 por sessão
        userOwned: true,
        attributes: [
            str('uid', 64, true),
            str('session_id', 36, true),
            int('generated_at'),
            str('model', 128),
            str('text', 65535),        // criptografado
            str('tldr', 65535),        // criptografado
            str('bullet_json', 65535), // criptografado
            str('action_json', 65535), // criptografado
            int('tokens_used'),
            int('updated_at'),
        ],
        indexes: [
            { key: 'unique_session', type: 'unique', attributes: ['session_id'] },
            { key: 'idx_uid', attributes: ['uid'] },
        ],
    },
    {
        id: 'prompt_presets', // agentes criados pelo usuário
        userOwned: true,
        attributes: [
            str('uid', 64, true),
            str('title', 1024, true),   // criptografado
            str('prompt', 16384, true), // criptografado
            bool('is_default', false),
            int('created_at'),
            int('updated_at'),
        ],
        indexes: [{ key: 'idx_uid', attributes: ['uid'] }],
    },
    {
        id: 'default_presets', // agentes padrão do produto — leitura pública, sem criptografia
        userOwned: false,
        attributes: [
            str('title', 1024, true),
            str('prompt', 16384, true),
            int('created_at'),
            int('updated_at'),
        ],
        // sem índice: lista minúscula gerida por admin; título de 1024 chars excede
        // o limite de 768 de chave de índice do MariaDB — ordenar no client
        indexes: [],
    },
];

// ---------------------------------------------------------------------------
// Seeds — agentes de vendas padrão do Copiloto V4.
// Fonte da verdade dos textos: sqliteClient.js (initDefaultData) e
// promptTemplates.js — manter em sincronia ao editar lá.
// ---------------------------------------------------------------------------
const { profilePrompts } = require('../../src/features/common/prompts/promptTemplates.js');

// Cópia do prompt inline de sqliteClient.js (defaultAgents / prevendaPrompt).
const PREVENDA_PROMPT = `Você apoia um PRÉ-VENDAS (SDR) da V4 Amaral&Co durante uma LIGAÇÃO com o lead. O objetivo desta ligação NÃO é vender: é qualificar o lead e agendar a reunião de diagnóstico com o closer, com dia e horário definidos ainda na ligação.

ROTEIRO DA LIGAÇÃO:
1. ABERTURA (máx. 30s): apresente-se, cite de onde veio o contato do lead (formulário, LeadBroker, indicação) e peça permissão objetiva: "Consigo te explicar em 2 minutos por que liguei — faz sentido?"
2. QUALIFICAÇÃO: descubra segmento, faturamento aproximado, se já investe em marketing (quanto e com quem), qual a principal dor comercial e se quem está na linha é o decisor. Uma pergunta de cada vez.
3. GERAÇÃO DE INTERESSE: conecte a dor declarada ao que a reunião de diagnóstico entrega ("nessa reunião a gente analisa seus números e te mostra onde está o vazamento"). Não apresente proposta, preço ou escopo — isso é papel do closer na reunião.
4. AGENDAMENTO: ofereça duas opções fechadas de horário ("terça às 10h ou quarta às 15h?"). Confirme e-mail para o convite e reforce o compromisso ("posso contar com você nesse horário?").

CONTORNO DE OBJEÇÕES DA LIGAÇÃO:
- "Me manda por WhatsApp/e-mail" → "Te mando sim, mas o material genérico não mostra o seu cenário — por isso a reunião de 40 minutos vale mais que qualquer PDF. Qual horário fica melhor?"
- "Não tenho interesse" → pergunte uma vez o motivo real (já tem agência? momento? experiência ruim?) e trate só essa objeção; se mantiver, agradeça e encerre com porta aberta.
- "Quanto custa?" → "Depende do seu cenário — é exatamente isso que o especialista avalia na reunião, sem compromisso. Posso agendar?"
- "Estou sem tempo agora" → seja direto: proponha já o agendamento ("então deixa eu ser rápido: qual dia dessa semana fica melhor pra uma conversa de 40 min?").

REGRAS:
- Sinal de compra ou lead qualificado e receptivo → vá direto para o agendamento, sem alongar a qualificação.
- Use os dados que o lead declarou; NUNCA invente números ou promessas de resultado.`;

const DEFAULT_PRESET_SEEDS = [
    { id: 'v4-closer-reuniao', title: 'Closer — Reunião (Playbook V4)', prompt: profilePrompts.v4_sales_copilot.content },
    { id: 'v4-prevenda-ligacao', title: 'Pré-venda — Ligação', prompt: PREVENDA_PROMPT },
];

// ---------------------------------------------------------------------------
const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const databases = new Databases(client);

const isConflict = (err) => err?.code === 409 || /already exists/i.test(err?.message || '');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function ensure(label, fn) {
    try {
        await fn();
        console.log(`  ✅ criado: ${label}`);
        return 'created';
    } catch (err) {
        if (isConflict(err)) {
            console.log(`  ↩︎  já existe: ${label}`);
            return 'exists';
        }
        throw new Error(`${label}: ${err.message}${err.code ? ` (code ${err.code})` : ''}`);
    }
}

async function waitAttributesAvailable(collectionId) {
    for (let i = 0; i < 30; i++) {
        const { attributes } = await databases.listAttributes({ databaseId: DB_ID, collectionId });
        const pending = attributes.filter(a => a.status !== 'available');
        if (pending.length === 0) return;
        await sleep(1000);
    }
    throw new Error(`Timeout esperando attributes de '${collectionId}' ficarem disponíveis`);
}

async function provision() {
    console.log(`\n🏗  Provisionando database '${DB_ID}' em ${ENDPOINT}\n`);

    await ensure(`database '${DB_ID}'`, () =>
        databases.create({ databaseId: DB_ID, name: 'Copiloto' }));

    for (const col of COLLECTIONS) {
        const permissions = col.userOwned
            ? [Permission.create(Role.users())] // criar: qualquer logado; ler/editar: permissions por documento
            : [Permission.read(Role.any())];    // default_presets: leitura pública, escrita só admin (API key)

        await ensure(`collection '${col.id}'`, () =>
            databases.createCollection({
                databaseId: DB_ID,
                collectionId: col.id,
                name: col.id,
                permissions,
                documentSecurity: col.userOwned,
            }));

        for (const attr of col.attributes) {
            const label = `${col.id}.${attr.key}`;
            if (attr.kind === 'string') {
                await ensure(label, () => databases.createStringAttribute({
                    databaseId: DB_ID, collectionId: col.id, key: attr.key,
                    size: attr.size, required: attr.required, array: attr.array || false,
                }));
            } else if (attr.kind === 'integer') {
                await ensure(label, () => databases.createIntegerAttribute({
                    databaseId: DB_ID, collectionId: col.id, key: attr.key, required: attr.required,
                }));
            } else if (attr.kind === 'boolean') {
                await ensure(label, () => databases.createBooleanAttribute({
                    databaseId: DB_ID, collectionId: col.id, key: attr.key,
                    required: false, xdefault: attr.xdefault,
                }));
            }
        }

        await waitAttributesAvailable(col.id);

        for (const idx of col.indexes) {
            const label = `${col.id} index '${idx.key}'`;
            try {
                await ensure(label, () => databases.createIndex({
                    databaseId: DB_ID, collectionId: col.id, key: idx.key,
                    type: idx.type || 'key', attributes: idx.attributes, orders: idx.orders,
                }));
            } catch (err) {
                if (idx.optional) console.warn(`  ⚠️  opcional falhou (ok): ${label} — ${err.message}`);
                else throw err;
            }
        }
    }
    console.log('\n✅ Provisionamento concluído.');
}

// ---------------------------------------------------------------------------
// Seeds de default_presets: id fixo → create (409 tolerado) + update de texto,
// espelhando o comportamento do SQLite (INSERT OR IGNORE + refresh no boot).
// ---------------------------------------------------------------------------
async function seedDefaultPresets() {
    console.log('\n🌱 Seeds de default_presets:');
    const now = Math.floor(Date.now() / 1000);
    for (const seed of DEFAULT_PRESET_SEEDS) {
        if (seed.prompt.length > 16384) {
            throw new Error(`Seed '${seed.id}': prompt com ${seed.prompt.length} chars excede o attribute (16384)`);
        }
        const created = await ensure(`default_presets/${seed.id}`, () =>
            databases.createDocument({
                databaseId: DB_ID, collectionId: 'default_presets', documentId: seed.id,
                data: { title: seed.title, prompt: seed.prompt, created_at: now, updated_at: now },
            }));
        if (created === 'exists') {
            await databases.updateDocument({
                databaseId: DB_ID, collectionId: 'default_presets', documentId: seed.id,
                data: { title: seed.title, prompt: seed.prompt, updated_at: now },
            });
            console.log(`  🔄 texto sincronizado: default_presets/${seed.id}`);
        }
    }
    console.log('✅ Seeds concluídos.');
}

// ---------------------------------------------------------------------------
// Smoke test: cria, lê e apaga um documento em cada collection (client admin)
// ---------------------------------------------------------------------------
const SMOKE_DOCS = {
    users: { display_name: 'Smoke User', email: 'smoke@example.invalid', created_at: 1, auto_update_enabled: true },
    sessions: { uid: 'smoke-uid', members: ['smoke-uid'], title: 'ct:abc', session_type: 'ask', started_at: 1, updated_at: 1 },
    transcripts: { uid: 'smoke-uid', session_id: 'smoke-session', start_at: 1, speaker: 'Me', text: 'ct:abc', lang: 'en', created_at: 1 },
    ai_messages: { uid: 'smoke-uid', session_id: 'smoke-session', sent_at: 1, role: 'user', content: 'ct:abc', tokens: 1, model: 'm', created_at: 1 },
    summaries: { uid: 'smoke-uid', session_id: 'smoke-session', generated_at: 1, model: 'm', text: 'ct:abc', tldr: 'ct:abc', bullet_json: 'ct:[]', action_json: 'ct:[]', tokens_used: 1, updated_at: 1 },
    prompt_presets: { uid: 'smoke-uid', title: 'ct:abc', prompt: 'ct:abc', is_default: false, created_at: 1 },
    default_presets: { title: 'Smoke Default', prompt: 'do nothing', created_at: 1 },
};

async function smokeTest() {
    console.log('\n🔥 Smoke test (create → get → delete em cada collection):');
    let failed = false;
    for (const col of COLLECTIONS) {
        const docId = ID.unique();
        try {
            const perms = col.userOwned
                ? [Permission.read(Role.user('smoke-uid')), Permission.update(Role.user('smoke-uid')), Permission.delete(Role.user('smoke-uid'))]
                : undefined;
            await databases.createDocument({
                databaseId: DB_ID, collectionId: col.id, documentId: docId,
                data: SMOKE_DOCS[col.id], permissions: perms,
            });
            const doc = await databases.getDocument({ databaseId: DB_ID, collectionId: col.id, documentId: docId });
            if (doc.$id !== docId) throw new Error('getDocument retornou outro $id');
            await databases.deleteDocument({ databaseId: DB_ID, collectionId: col.id, documentId: docId });
            console.log(`  ✅ ${col.id}`);
        } catch (err) {
            failed = true;
            console.error(`  ❌ ${col.id}: ${err.message}`);
        }
    }
    if (failed) throw new Error('Smoke test falhou em pelo menos uma collection');
    console.log('\n✅ Smoke test passou em todas as collections.');
}

(async () => {
    try {
        await provision();
        await seedDefaultPresets();
        await smokeTest();
        process.exit(0);
    } catch (err) {
        console.error(`\n❌ Falha: ${err.message}`);
        process.exit(1);
    }
})();
