// Sincronização pós-call com o Supabase (Enriquece AI) — Sprint 2.2.
// Ao fim de cada sessão de escuta, envia a transcrição completa (lida do SQLite)
// para a edge function save-transcript. Falhou (sem rede, token expirado etc.)?
// A sessão entra numa fila local em disco e é reenviada no próximo boot.

const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { V4_SUPABASE_URL } = require('../config/v4Config');

const SAVE_TRANSCRIPT_URL = `${V4_SUPABASE_URL}/functions/v1/save-transcript`;
const BRIEFING_LOOKUP_URL = `${V4_SUPABASE_URL}/functions/v1/briefing-lookup`;
const LEADS_SEARCH_URL = `${V4_SUPABASE_URL}/functions/v1/leads-search`;

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

    _buildPayload(sessionId) {
        const sessionRepository = require('../repositories/session');
        const sttRepository = require('../../listen/stt/repositories');
        const session = sessionRepository.getById ? sessionRepository.getById(sessionId) : null;
        const transcripts = sttRepository.getAllTranscriptsBySessionId(sessionId) || [];

        const toIso = epochSeconds => (epochSeconds ? new Date(epochSeconds * 1000).toISOString() : null);

        return {
            local_session_id: sessionId,
            lead_briefing: this._leadBriefing || null,
            started_at: toIso(session?.started_at),
            ended_at: toIso(session?.ended_at) || new Date().toISOString(),
            transcripts: transcripts.map((t, i) => ({
                seq: i,
                speaker: t.speaker,
                text: t.text,
                spoken_at: toIso(t.start_at),
            })),
        };
    }

    setLeadBriefing(text) {
        this._leadBriefing = text || null;
    }

    /**
     * Envia a sessão para o Supabase. skipQueueOnFail=true evita re-enfileirar
     * quando já estamos processando a própria fila.
     */
    async uploadSession(sessionId, { skipQueueOnFail = false } = {}) {
        if (!sessionId) return { success: false, error: 'missing_session' };

        try {
            const v4AuthService = require('./v4AuthService');
            const token = await v4AuthService.getAccessToken();
            if (!token) {
                throw new Error('sem sessão V4 (login necessário)');
            }

            const payload = this._buildPayload(sessionId);
            if (payload.transcripts.length === 0) {
                console.log(`[V4Sync] Session ${sessionId} sem transcrição — nada a enviar`);
                this._dequeue(sessionId);
                return { success: true, skipped: true };
            }

            const resp = await fetch(SAVE_TRANSCRIPT_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(payload),
            });

            const result = await resp.json().catch(() => ({}));
            if (!resp.ok || !result.success) {
                throw new Error(result.error || `HTTP ${resp.status}`);
            }

            this._dequeue(sessionId);
            console.log(`[V4Sync] ✅ Transcrição enviada ao Supabase: ${result.turns} turnos (call ${result.call_session_id})`);
            return { success: true, call_session_id: result.call_session_id };
        } catch (err) {
            console.error(`[V4Sync] Falha ao enviar session ${sessionId}:`, err.message);
            if (!skipQueueOnFail) this._enqueue(sessionId);
            return { success: false, error: err.message };
        }
    }

    /**
     * Busca o briefing da próxima reunião: Calendar (n8n) → match no Enriquece AI.
     * Retorna { found, matched, event, lead_id, briefing } ou { found:false }.
     */
    async fetchBriefing() {
        const v4AuthService = require('./v4AuthService');
        const token = await v4AuthService.getAccessToken();
        if (!token) return { found: false, error: 'not_logged_in' };

        const resp = await fetch(BRIEFING_LOOKUP_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: '{}',
        });
        const result = await resp.json().catch(() => ({}));
        if (!resp.ok) {
            throw new Error(result.error || `HTTP ${resp.status}`);
        }
        return result;
    }

    /** Busca manual de leads (fallback do briefing). Retorna [{lead_id, label, briefing}]. */
    async searchLeads(query) {
        const v4AuthService = require('./v4AuthService');
        const token = await v4AuthService.getAccessToken();
        if (!token) throw new Error('Faça login V4 nas Configurações primeiro.');

        const resp = await fetch(LEADS_SEARCH_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ query }),
        });
        const result = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(result.error || `HTTP ${resp.status}`);
        return result.results || [];
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
