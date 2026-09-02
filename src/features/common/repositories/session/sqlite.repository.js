const sqliteClient = require('../../services/sqliteClient');

function getById(id) {
    const db = sqliteClient.getDb();
    return db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);
}

function create(uid, type = 'ask') {
    const db = sqliteClient.getDb();
    const sessionId = require('crypto').randomUUID();
    const now = Math.floor(Date.now() / 1000);
    const query = `INSERT INTO sessions (id, uid, title, session_type, started_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`;
    
    try {
        db.prepare(query).run(sessionId, uid, `Session @ ${new Date().toLocaleTimeString()}`, type, now, now);
        console.log(`SQLite: Created session ${sessionId} for user ${uid} (type: ${type})`);
        return sessionId;
    } catch (err) {
        console.error('SQLite: Failed to create session:', err);
        throw err;
    }
}

function getAllByUserId(uid) {
    const db = sqliteClient.getDb();
    const query = "SELECT id, uid, title, session_type, started_at, ended_at, sync_state, updated_at FROM sessions WHERE uid = ? ORDER BY started_at DESC";
    return db.prepare(query).all(uid);
}

function updateTitle(id, title) {
    const db = sqliteClient.getDb();
    const result = db.prepare('UPDATE sessions SET title = ? WHERE id = ?').run(title, id);
    return { changes: result.changes };
}

/**
 * Grava o título e de onde ele veio ('padrao' | 'ia' | futuramente 'calendario').
 */
function updateTitleWithSource(id, title, source) {
    const db = sqliteClient.getDb();
    const now = Math.floor(Date.now() / 1000);
    const result = db
        .prepare('UPDATE sessions SET title = ?, title_source = ?, updated_at = ? WHERE id = ?')
        .run(title, source, now, id);
    return { changes: result.changes };
}

/**
 * Sessões que ainda têm o título automático "Session @ <hora>" e transcrição
 * suficiente para a IA nomear. Usado pelo backfill no boot.
 *
 * Não depende de nada específico deste banco: a regra é title_source ausente/'padrao'
 * + título com o prefixo herdado + mínimo de falas.
 */
function getSessionsNeedingTitle(uid, { minTurns = 6, limit = 40 } = {}) {
    const db = sqliteClient.getDb();
    const query = `
        SELECT s.id, s.title, s.started_at, COUNT(t.id) AS turns
        FROM sessions s
        JOIN transcripts t ON t.session_id = s.id
        WHERE s.uid = ?
          AND (s.title_source IS NULL OR s.title_source = '' OR s.title_source = 'padrao')
          AND (s.title IS NULL OR s.title LIKE 'Session @%')
        GROUP BY s.id
        HAVING COUNT(t.id) >= ?
        ORDER BY s.started_at DESC
        LIMIT ?
    `;
    return db.prepare(query).all(uid, minTurns, limit);
}

function deleteWithRelatedData(id) {
    const db = sqliteClient.getDb();
    const transaction = db.transaction(() => {
        db.prepare("DELETE FROM transcripts WHERE session_id = ?").run(id);
        db.prepare("DELETE FROM ai_messages WHERE session_id = ?").run(id);
        db.prepare("DELETE FROM summaries WHERE session_id = ?").run(id);
        db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
    });
    
    try {
        transaction();
        return { success: true };
    } catch (err) {
        throw err;
    }
}

function end(id) {
    const db = sqliteClient.getDb();
    const now = Math.floor(Date.now() / 1000);
    const query = `UPDATE sessions SET ended_at = ?, updated_at = ? WHERE id = ?`;
    const result = db.prepare(query).run(now, now, id);
    return { changes: result.changes };
}

function updateType(id, type) {
    const db = sqliteClient.getDb();
    const now = Math.floor(Date.now() / 1000);
    const query = 'UPDATE sessions SET session_type = ?, updated_at = ? WHERE id = ?';
    const result = db.prepare(query).run(type, now, id);
    return { changes: result.changes };
}

function touch(id) {
    const db = sqliteClient.getDb();
    const now = Math.floor(Date.now() / 1000);
    const query = 'UPDATE sessions SET updated_at = ? WHERE id = ?';
    const result = db.prepare(query).run(now, id);
    return { changes: result.changes };
}

function getOrCreateActive(uid, requestedType = 'ask') {
    const db = sqliteClient.getDb();
    
    // 1. Look for ANY active session for the user (ended_at IS NULL).
    //    Prefer 'listen' sessions over 'ask' sessions to ensure continuity.
    const findQuery = `
        SELECT id, session_type FROM sessions 
        WHERE uid = ? AND ended_at IS NULL
        ORDER BY CASE session_type WHEN 'listen' THEN 1 WHEN 'ask' THEN 2 ELSE 3 END
        LIMIT 1
    `;

    const activeSession = db.prepare(findQuery).get(uid);

    if (activeSession) {
        // An active session exists.
        console.log(`[Repo] Found active session ${activeSession.id} of type ${activeSession.session_type}`);
        
        // 2. Promotion Logic: If it's an 'ask' session and we need 'listen', promote it.
        if (activeSession.session_type === 'ask' && requestedType === 'listen') {
            updateType(activeSession.id, 'listen');
            console.log(`[Repo] Promoted session ${activeSession.id} to 'listen' type.`);
        }

        // 3. Touch the session and return its ID.
        touch(activeSession.id);
        return activeSession.id;
    } else {
        // 4. No active session found, create a new one.
        console.log(`[Repo] No active session for user ${uid}. Creating new '${requestedType}' session.`);
        return create(uid, requestedType);
    }
}

function endAllActiveSessions(uid) {
    const db = sqliteClient.getDb();
    const now = Math.floor(Date.now() / 1000);
    // Filter by uid to match the Firebase repository's behavior.
    const query = `UPDATE sessions SET ended_at = ?, updated_at = ? WHERE ended_at IS NULL AND uid = ?`;
    
    try {
        const result = db.prepare(query).run(now, now, uid);
        console.log(`[Repo] Ended ${result.changes} active SQLite session(s) for user ${uid}.`);
        return { changes: result.changes };
    } catch (err) {
        console.error('SQLite: Failed to end all active sessions:', err);
        throw err;
    }
}

module.exports = {
    getById,
    create,
    getAllByUserId,
    updateTitle,
    updateTitleWithSource,
    getSessionsNeedingTitle,
    deleteWithRelatedData,
    end,
    updateType,
    touch,
    getOrCreateActive,
    endAllActiveSessions,
}; 