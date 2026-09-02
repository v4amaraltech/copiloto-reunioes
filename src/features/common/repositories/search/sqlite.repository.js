const sqliteClient = require('../../services/sqliteClient');

const LIMITE_PADRAO = 20;
const SNIPPETS_POR_SESSAO = 2;

/**
 * Transforma o que o usuário digitou numa expressão MATCH válida do FTS5.
 *
 * O FTS5 trata aspas, asteriscos, parênteses, `:` e `^` como sintaxe — digitar
 * `preço: "R$ 5.000"` quebraria a query com erro de sintaxe. Aqui cada palavra
 * vira um termo entre aspas (o que a torna literal) com `*` de prefixo, e os
 * termos são unidos por AND: "quanto cust" acha "quanto custa".
 *
 * @returns {string|null} expressão MATCH, ou null se não sobrou nada buscável.
 */
function montarExpressaoFts(query) {
    if (!query || typeof query !== 'string') return null;

    // Divide em tokens por qualquer coisa que não seja letra/dígito (inclui acentos).
    const tokens = query
        .split(/[^\p{L}\p{N}]+/u)
        .map(t => t.trim())
        .filter(Boolean);

    if (tokens.length === 0) return null;

    // Aspas dentro do termo são escapadas dobrando, como manda o FTS5.
    return tokens.map(t => `"${t.replace(/"/g, '""')}"*`).join(' AND ');
}

/** Escapa curingas do LIKE para que `%` e `_` digitados sejam literais. */
function montarPadraoLike(query) {
    return `%${String(query).replace(/[\\%_]/g, c => '\\' + c)}%`;
}

/**
 * Busca sessões do usuário por conteúdo da transcrição (FTS5) e por título.
 *
 * @param {string} uid
 * @param {string} query - texto livre digitado pelo usuário
 * @param {number} [limit] - máximo de sessões devolvidas
 * @returns {Array<{id,title,started_at,ended_at,session_type,match_count,snippets,matched_title}>}
 */
function search(uid, query, limit = LIMITE_PADRAO) {
    const db = sqliteClient.getDb();
    const termo = (query || '').trim();
    if (!termo) return [];

    const limiteSessoes = Math.max(1, Math.min(Number(limit) || LIMITE_PADRAO, 100));
    const porSessao = new Map();

    const registrar = (linha) => {
        let sessao = porSessao.get(linha.id);
        if (!sessao) {
            sessao = {
                id: linha.id,
                title: linha.title,
                started_at: linha.started_at,
                ended_at: linha.ended_at,
                session_type: linha.session_type,
                match_count: 0,
                snippets: [],
                matched_title: false,
            };
            porSessao.set(linha.id, sessao);
        }
        return sessao;
    };

    // 1) Conteúdo das falas, via índice FTS5.
    const expressao = montarExpressaoFts(termo);
    if (expressao && sqliteClient.isSearchIndexReady()) {
        // Teto generoso de trechos: um termo comum pode bater centenas de vezes na
        // mesma call, e precisamos de linhas suficientes para cobrir N sessões.
        const tetoTrechos = limiteSessoes * 40;
        const sql = `
            SELECT t.session_id AS id,
                   s.title       AS title,
                   s.started_at  AS started_at,
                   s.ended_at    AS ended_at,
                   s.session_type AS session_type,
                   snippet(transcripts_fts, 0, '[', ']', '…', 12) AS snippet
            FROM transcripts_fts
            JOIN transcripts t ON t.rowid = transcripts_fts.rowid
            JOIN sessions   s ON s.id = t.session_id
            WHERE transcripts_fts MATCH ? AND s.uid = ?
            ORDER BY bm25(transcripts_fts)
            LIMIT ?
        `;
        try {
            const linhas = db.prepare(sql).all(expressao, uid, tetoTrechos);
            for (const linha of linhas) {
                const sessao = registrar(linha);
                sessao.match_count += 1;
                if (sessao.snippets.length < SNIPPETS_POR_SESSAO && linha.snippet) {
                    sessao.snippets.push(linha.snippet.replace(/\s+/g, ' ').trim());
                }
            }
        } catch (err) {
            // Query malformada não pode derrubar a busca — cai só no título.
            console.error('[SearchRepo] FTS query failed:', err.message);
        }
    }

    // 2) Título da sessão (LIKE simples basta — são poucas dezenas de linhas).
    const porTitulo = db.prepare(`
        SELECT id, title, started_at, ended_at, session_type
        FROM sessions
        WHERE uid = ? AND title LIKE ? ESCAPE '\\'
        ORDER BY started_at DESC
        LIMIT ?
    `).all(uid, montarPadraoLike(termo), limiteSessoes);

    for (const linha of porTitulo) {
        registrar(linha).matched_title = true;
    }

    // Ordena por relevância grosseira: título batendo primeiro, depois quantidade
    // de trechos, depois a call mais recente.
    return Array.from(porSessao.values())
        .sort((a, b) => {
            if (a.matched_title !== b.matched_title) return a.matched_title ? -1 : 1;
            if (a.match_count !== b.match_count) return b.match_count - a.match_count;
            return (b.started_at || 0) - (a.started_at || 0);
        })
        .slice(0, limiteSessoes);
}

module.exports = {
    search,
    montarExpressaoFts,
};
