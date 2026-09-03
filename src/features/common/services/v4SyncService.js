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
const { DATABASE_ID, getDatabasesInstance, Permission, Role, Query } = require('./appwriteClient');

// Backfill de permissões do time: quanto lemos por página, quanto escrevemos por boot.
// O teto existe para o primeiro boot depois de entrar num time não virar uma enxurrada
// de escritas no servidor — o que sobrar entra no boot seguinte.
const BACKFILL_LOTE = 100;
const BACKFILL_TETO_POR_BOOT = 300;

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

    /**
     * Permissões de um documento do usuário. Quando ele está num time, entra também a
     * leitura do papel próprio dele (`c<uid>`) — papel que o GESTOR carrega, e é assim
     * que o gestor enxerga a call sem que os outros closers enxerguem (docs/TIMES.md).
     *
     * O papel tem de ser um que o próprio autor possua: `read("team:<id>/gestor")`
     * seria recusado com 401 pelo servidor.
     */
    _permissoesDoDono(uid) {
        return [
            Permission.read(Role.user(uid)),
            Permission.update(Role.user(uid)),
            Permission.delete(Role.user(uid)),
        ];
    }

    /**
     * 401 "Permissions must be one of: ..." — o usuário tentou conceder um papel que
     * não possui. Não é sessão expirada: é o papel do time que ele não tem mais.
     */
    _ePermissaoDoTimeRecusada(err) {
        return err?.code === 401 && /Permissions must be one of/i.test(String(err?.message || ''));
    }

    /** Relê o time do servidor; se o usuário saiu (ou foi removido), o estado local é limpo. */
    async _relerTimeDoServidor() {
        try {
            const v4TeamService = require('./v4TeamService');
            const lido = await v4TeamService.getMyTeam();
            return lido.team ? { ...lido.team, role: lido.role } : null;
        } catch (err) {
            console.warn('[V4Sync] Não foi possível reler o time do servidor:', err.message);
            return null;
        }
    }

    /** Sobe sessão + transcrição com as permissões dadas. Lança no primeiro erro. */
    async _enviarDocumentos(databases, { sessionId, session, transcripts, uid, perms, teamId }) {
        const now = Math.floor(Date.now() / 1000);

        await this._createOrUpdate(databases, 'sessions', sessionId, this._compact({
            uid,
            team_id: teamId || null,
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
        return sent;
    }

    async _permissoesDoDocumento(uid) {
        const perms = this._permissoesDoDono(uid);

        try {
            const v4AuthService = require('./v4AuthService');
            const team = await v4AuthService.getTeamState();
            if (team?.id) {
                const { papelDoCloser } = require('./v4TeamService');
                perms.push(Permission.read(Role.team(team.id, papelDoCloser(uid))));
            }
        } catch (err) {
            // Sem time (ou estado indisponível): sobe só com as permissões do dono.
            console.warn('[V4Sync] Não foi possível ler o estado do time:', err.message);
        }

        return perms;
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
            const perms = await this._permissoesDoDocumento(uid);
            const teamAtual = await v4AuthService.getTeamState();

            let sent;
            try {
                sent = await this._enviarDocumentos(databases, { sessionId, session, transcripts, uid, perms, teamId: teamAtual?.id });
            } catch (err) {
                if (!this._ePermissaoDoTimeRecusada(err) || !teamAtual?.id) throw err;

                // O servidor recusou o papel do time: o closer foi removido (ou nunca recebeu
                // o papel) e o estado local ainda diz que ele está no time. Relê o time do
                // servidor — o que limpa o estado se ele saiu — e reenvia só com as
                // permissões do dono. Perder a call seria pior do que subi-la sem o gestor;
                // o backfill acrescenta a permissão depois, se ele voltar ao time.
                console.warn(`[V4Sync] Servidor recusou a permissão do time "${teamAtual.name || teamAtual.id}" — relendo o time e reenviando sem ela.`);
                await this._relerTimeDoServidor();
                const permsDoDono = this._permissoesDoDono(uid);
                const timeDepois = await v4AuthService.getTeamState();
                sent = await this._enviarDocumentos(databases, { sessionId, session, transcripts, uid, perms: permsDoDono, teamId: timeDepois?.id });
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

    /**
     * BACKFILL de permissões: documentos que já subiram ANTES de o usuário entrar no
     * time não têm a permissão de leitura do gestor. Aqui ela é acrescentada com
     * updateDocument só de `permissions` (o conteúdo não é reenviado).
     *
     * Roda em background: lotes pequenos, pausa entre eles e teto por boot — o gestor
     * passa a ver o histórico sem que a UI trave nem o servidor leve uma enxurrada.
     *
     * Idempotente: um documento que já tem a permissão é pulado sem chamada de escrita.
     */
    async backfillTeamPermissions({ limit = BACKFILL_TETO_POR_BOOT, pauseMs = 300 } = {}) {
        let atualizados = 0;
        let verificados = 0;

        try {
            const v4AuthService = require('./v4AuthService');
            const uid = await v4AuthService.getUserId();
            const team = await v4AuthService.getTeamState();
            if (!uid || !team?.id) {
                return { atualizados, verificados, motivo: 'sem_time' };
            }

            const { papelDoCloser } = require('./v4TeamService');
            const permissaoDoTime = Permission.read(Role.team(team.id, papelDoCloser(uid)));

            const databases = getDatabasesInstance();
            const colecoes = ['sessions', 'transcripts', 'ai_messages', 'summaries'];

            console.log(`[V4Sync] Backfill de permissões do time "${team.name || team.id}" iniciado.`);

            for (const collectionId of colecoes) {
                let cursor = null;

                while (atualizados < limit) {
                    const queries = [
                        Query.equal('uid', uid),
                        Query.limit(Math.min(BACKFILL_LOTE, limit - atualizados + BACKFILL_LOTE)),
                    ];
                    if (cursor) queries.push(Query.cursorAfter(cursor));

                    const pagina = await databases.listDocuments({
                        databaseId: DATABASE_ID, collectionId, queries,
                    });

                    const docs = pagina?.documents || [];
                    if (docs.length === 0) break;
                    cursor = docs[docs.length - 1].$id;

                    for (const doc of docs) {
                        verificados++;
                        const permissoes = doc.$permissions || [];
                        if (permissoes.includes(permissaoDoTime)) continue; // já tem

                        try {
                            await databases.updateDocument({
                                databaseId: DATABASE_ID,
                                collectionId,
                                documentId: doc.$id,
                                permissions: [...permissoes, permissaoDoTime],
                            });
                            atualizados++;
                        } catch (err) {
                            if (this._ePermissaoDoTimeRecusada(err)) {
                                // O usuário não tem mais o papel do time: parar aqui em vez de
                                // repetir o mesmo erro em centenas de documentos, e reler o
                                // time para o estado local parar de dizer que ele está nele.
                                console.warn(`[V4Sync] Backfill interrompido: o servidor recusou o papel do time "${team.name || team.id}". Relendo o time.`);
                                await this._relerTimeDoServidor();
                                return { atualizados, verificados, motivo: 'papel_recusado' };
                            }
                            console.warn(`[V4Sync] Backfill falhou em ${collectionId}/${doc.$id}: ${err.message}`);
                        }

                        if (atualizados >= limit) break;
                    }

                    if (docs.length < BACKFILL_LOTE) break;
                    if (pauseMs > 0) await new Promise(r => setTimeout(r, pauseMs));
                }
            }

            console.log(`[V4Sync] Backfill de permissões: ${atualizados} documento(s) atualizados de ${verificados} verificados.`);
        } catch (err) {
            console.error('[V4Sync] Backfill de permissões falhou:', err.message);
        }

        return { atualizados, verificados };
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
