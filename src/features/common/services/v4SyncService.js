// Sincronização pós-call com o Appwrite self-hosted (passos 3+4 da migração).
// Ao fim de cada sessão de escuta, grava a sessão + transcrição completa (lidas
// do SQLite) direto nas collections `sessions` e `transcripts`, com permissions
// por documento do closer logado. Falhou (sem rede, sessão expirada etc.)?
// A sessão entra numa fila local em disco e é reenviada no próximo boot.
//
// Os documentos usam o id local (UUID) como documentId — retry é idempotente:
// 409 na sessão vira update, 409 em transcript significa "já subiu".
// Nota: os textos sobem em claro por ora (paridade com o save-transcript do
// Supabase); criptografia por campo entra quando os repositories migrarem.

const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { DATABASE_ID, getDatabasesInstance, Permission, Role } = require('./appwriteClient');

class V4SyncService {
    constructor() {
        this.queuePath = null;
    }

    _getQueuePath() {
        if (!this.queuePath) {
            this.queuePath = path.join(app.getPath('userData'), 'upload-queue.json');
        }
        return this.queuePath;
    }

    _readQueue() {
        try {
            return JSON.parse(fs.readFileSync(this._getQueuePath(), 'utf8'));
        } catch (_) {
            return [];
        }
    }

    _writeQueue(queue) {
        try {
            fs.writeFileSync(this._getQueuePath(), JSON.stringify(queue));
        } catch (err) {
            console.error('[V4Sync] Failed to persist upload queue:', err.message);
        }
    }

    _enqueue(sessionId) {
        const queue = this._readQueue();
        if (!queue.includes(sessionId)) {
            queue.push(sessionId);
            this._writeQueue(queue);
            console.log(`[V4Sync] Session ${sessionId} enfileirada para reenvio (${queue.length} pendentes)`);
        }
    }

    _dequeue(sessionId) {
        this._writeQueue(this._readQueue().filter(id => id !== sessionId));
    }

    /** Remove chaves null/undefined (attributes opcionais ficam de fora do doc). */
    _compact(data) {
        return Object.fromEntries(Object.entries(data).filter(([, v]) => v !== null && v !== undefined));
    }

    async _createOrUpdate(databases, collectionId, documentId, data, permissions) {
        try {
            await databases.createDocument({
                databaseId: DATABASE_ID, collectionId, documentId, data, permissions,
            });
            return 'created';
        } catch (err) {
            if (err?.code === 409) {
                if (collectionId === 'sessions') {
                    await databases.updateDocument({
                        databaseId: DATABASE_ID, collectionId, documentId, data,
                    });
                    return 'updated';
                }
                return 'exists'; // transcript já subiu num retry anterior
            }
            throw err;
        }
    }

    /**
     * Envia a sessão para o Appwrite. skipQueueOnFail=true evita re-enfileirar
     * quando já estamos processando a própria fila.
     */
    async uploadSession(sessionId, { skipQueueOnFail = false } = {}) {
        if (!sessionId) return { success: false, error: 'missing_session' };

        try {
            const v4AuthService = require('./v4AuthService');
            const uid = await v4AuthService.getUserId();
            if (!uid) {
                throw new Error('sem sessão V4 (login necessário)');
            }

            const sessionRepository = require('../repositories/session');
            const sttRepository = require('../../listen/stt/repositories');
            const session = sessionRepository.getById ? await sessionRepository.getById(sessionId) : null;
            const transcripts = (await sttRepository.getAllTranscriptsBySessionId(sessionId)) || [];

            if (transcripts.length === 0) {
                console.log(`[V4Sync] Session ${sessionId} sem transcrição — nada a enviar`);
                this._dequeue(sessionId);
                return { success: true, skipped: true };
            }

            const databases = getDatabasesInstance();
            const now = Math.floor(Date.now() / 1000);
            const perms = [
                Permission.read(Role.user(uid)),
                Permission.update(Role.user(uid)),
                Permission.delete(Role.user(uid)),
            ];

            await this._createOrUpdate(databases, 'sessions', sessionId, this._compact({
                uid,
                title: session?.title || 'Sessão de escuta',
                session_type: session?.session_type || 'listen',
                started_at: session?.started_at,
                ended_at: session?.ended_at || now,
                updated_at: now,
            }), perms);

            let sent = 0;
            for (const t of transcripts) {
                await this._createOrUpdate(databases, 'transcripts', t.id, this._compact({
                    uid,
                    session_id: sessionId,
                    start_at: t.start_at,
                    end_at: t.end_at,
                    speaker: t.speaker,
                    text: t.text,
                    lang: t.lang,
                    created_at: t.created_at,
                    updated_at: now,
                }), perms);
                sent++;
            }

            this._dequeue(sessionId);
            console.log(`[V4Sync] ✅ Transcrição enviada ao Appwrite: ${sent} turnos (session ${sessionId})`);
            return { success: true, turns: sent };
        } catch (err) {
            console.error(`[V4Sync] Falha ao enviar session ${sessionId}:`, err.message);
            if (!skipQueueOnFail) this._enqueue(sessionId);
            return { success: false, error: err.message };
        }
    }

    /**
     * Propaga só o título ao documento já existente no Appwrite.
     *
     * Usado quando a sessão foi enviada antes de a IA nomeá-la (backfill das calls
     * antigas). Documento inexistente (404) ou usuário deslogado não são erro: o
     * título vai junto no próximo `uploadSession`.
     */
    async pushSessionTitle(sessionId, title) {
        if (!sessionId || !title) return { success: false, error: 'missing_args' };

        try {
            const v4AuthService = require('./v4AuthService');
            const uid = await v4AuthService.getUserId();
            if (!uid) return { success: false, skipped: 'sem_login' };

            const databases = getDatabasesInstance();
            await databases.updateDocument({
                databaseId: DATABASE_ID,
                collectionId: 'sessions',
                documentId: sessionId,
                data: { title, updated_at: Math.floor(Date.now() / 1000) },
            });
            console.log(`[V4Sync] Título da sessão ${sessionId} atualizado no Appwrite.`);
            return { success: true };
        } catch (err) {
            if (err?.code === 404) {
                // Ainda não subiu — o uploadSession vai levar o título novo.
                return { success: false, skipped: 'nao_enviada' };
            }
            console.warn(`[V4Sync] Falha ao atualizar título da sessão ${sessionId}:`, err.message);
            return { success: false, error: err.message };
        }
    }

    /** Reenvia sessões pendentes (chamado no boot). */
    async retryPending() {
        const queue = this._readQueue();
        if (queue.length === 0) return;
        console.log(`[V4Sync] Reenviando ${queue.length} sessão(ões) pendente(s)...`);
        for (const sessionId of queue) {
            await this.uploadSession(sessionId, { skipQueueOnFail: true });
        }
    }
}

const v4SyncService = new V4SyncService();
module.exports = v4SyncService;
