// Times (empresa) no Appwrite self-hosted: o gestor vê as reuniões dos closers dele.
//
// Modelo e as medições que o justificam: docs/TIMES.md.
//
// Resumo do que importa para ler este arquivo:
//   · team = empresa; papéis 'gestor' (quem cria) e 'closer'; 1 time por usuário nesta fase.
//   · O Appwrite só deixa um usuário conceder permissões de papéis que ELE possui — por isso
//     `read("team:<id>/gestor")` gravado pelo closer é recusado (401). A saída medida: cada
//     closer ganha um papel próprio `c<uid>`, e a membership do gestor acumula esses papéis.
//     O documento leva `read("team:<id>/c<uid-do-dono>")`, que o closer PODE conceder e só o
//     dono e o gestor conseguem ler.
//   · Chamadas por fetch direto com X-Appwrite-Session, como no v4AuthService: o SDK
//     node-appwrite é feito para o 1.9.x e o servidor roda 1.7.4.

const { APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_DATABASE_ID } = require('../config/appwriteConfig');
const v4AuthService = require('./v4AuthService');

const CONVITE_URL = process.env.V4_INVITE_URL || 'https://conta.v4companyamaral.com/convite';

const PAPEL_GESTOR = 'gestor';
const PAPEL_CLOSER = 'closer';

// Papéis do Appwrite aceitam [a-zA-Z0-9] e no máximo 32 chars. O uid tem 20, então
// 'c' + uid cabe com folga e é determinístico — nada extra para persistir.
function papelDoCloser(uid) {
    return 'c' + String(uid || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 31);
}

/** Papéis de estrutura (não são papéis-por-closer). */
const PAPEIS_ESTRUTURAIS = new Set([PAPEL_GESTOR, PAPEL_CLOSER, 'owner']);

// Erros do Appwrite vêm em inglês; devolvemos `code` estável + `error` em pt-BR,
// no mesmo contrato do v4AuthService.
function traduzErro(json, status) {
    const type = json?.type || '';
    const msg = String(json?.message || '');

    if (status === 401 && /Permissions must be one of/.test(msg)) {
        return { code: 'permissao_recusada', error: 'O servidor recusou as permissões deste documento. Saia e entre no time novamente.' };
    }
    if (type === 'team_invite_already_exists' || /already exists/i.test(msg)) {
        return { code: 'convite_ja_existe', error: 'Esta pessoa já foi convidada para o time.' };
    }
    if (type === 'team_invite_not_found' || type === 'membership_not_found') {
        return { code: 'convite_nao_encontrado', error: 'Este convite não existe mais.' };
    }
    if (type === 'team_not_found') {
        return { code: 'time_nao_encontrado', error: 'Este time não existe mais.' };
    }
    if (type === 'general_argument_invalid' && /`email`/.test(msg)) {
        return { code: 'email_invalido', error: 'E-mail inválido. Confira o endereço digitado.' };
    }
    if (type === 'general_argument_invalid' && /`url`/.test(msg)) {
        return { code: 'url_nao_registrada', error: 'O link do convite não está liberado no servidor. Avise o suporte.' };
    }
    if (type === 'general_argument_invalid') {
        return { code: 'dados_invalidos', error: 'Dados inválidos. Confira o que foi preenchido.' };
    }
    if (type === 'user_unauthorized' || status === 403) {
        return { code: 'sem_permissao', error: 'Você não tem permissão para fazer isso neste time.' };
    }
    if (type === 'general_rate_limit_exceeded' || status === 429) {
        return { code: 'muitas_tentativas', error: 'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.' };
    }
    if (status === 401) {
        return { code: 'sem_sessao', error: 'Sua sessão expirou. Entre novamente.' };
    }
    return { code: type || 'erro_desconhecido', error: 'Não foi possível concluir. Tente novamente em instantes.' };
}

class V4TeamService {
    /** Chamada autenticada pela sessão do usuário. */
    async _call(caminho, metodo = 'GET', body) {
        const secret = await v4AuthService.getSessionSecret();
        if (!secret) {
            return { ok: false, status: 401, json: { type: 'sem_sessao' }, semSessao: true };
        }
        const resp = await fetch(`${APPWRITE_ENDPOINT}${caminho}`, {
            method: metodo,
            headers: {
                'Content-Type': 'application/json',
                'X-Appwrite-Project': APPWRITE_PROJECT_ID,
                'X-Appwrite-Locale': 'pt-br',
                'X-Appwrite-Response-Format': '1.7.0',
                'X-Appwrite-Session': secret,
            },
            body: body ? JSON.stringify(body) : undefined,
        });
        // 204 (delete) não tem corpo.
        const json = resp.status === 204 ? {} : await resp.json().catch(() => ({}));
        return { ok: resp.ok, status: resp.status, json };
    }

    /** Erro de rede padronizado, para não repetir o try/catch em toda função. */
    _falhaRede(contexto, err) {
        console.error(`[V4Team] ${contexto}:`, err.message);
        return { success: false, code: 'falha_rede', error: 'Sem conexão com o servidor. Tente novamente.' };
    }

    /**
     * Cadastro dos membros (nome + e-mail), guardado nos prefs do time.
     *
     * Por que isto existe: no Appwrite 1.7.4, `GET /teams/{id}/memberships` chamado com
     * SESSÃO DE USUÁRIO devolve `userName` e `userEmail` VAZIOS — só a API key os enxerga
     * (medido; ver docs/TIMES.md). Sem isso a tela do gestor mostraria uma lista de ids.
     * Os prefs do time são escritos só por quem administra o time e lidos por qualquer
     * membro, que é exatamente a visibilidade que queremos para uma lista de colegas.
     */
    async _lerCadastro(teamId) {
        const r = await this._call(`/teams/${teamId}/prefs`);
        if (!r.ok) return {};
        try {
            return JSON.parse(r.json?.membros || '{}');
        } catch (_) {
            return {};
        }
    }

    async _gravarCadastro(teamId, cadastro) {
        const r = await this._call(`/teams/${teamId}/prefs`, 'PUT', {
            prefs: { membros: JSON.stringify(cadastro) },
        });
        if (!r.ok) {
            console.warn('[V4Team] Não foi possível gravar o cadastro de membros:', r.json?.message);
        }
        return r.ok;
    }

    /** Acrescenta/atualiza uma pessoa no cadastro (só o gestor consegue escrever). */
    async _registrarNoCadastro(teamId, userId, nome, email) {
        const cadastro = await this._lerCadastro(teamId);
        cadastro[userId] = { n: nome || '', e: email || '' };
        return await this._gravarCadastro(teamId, cadastro);
    }

    async _removerDoCadastro(teamId, userId) {
        const cadastro = await this._lerCadastro(teamId);
        if (!(userId in cadastro)) return true;
        delete cadastro[userId];
        return await this._gravarCadastro(teamId, cadastro);
    }

    _papelDaMembership(roles = []) {
        if (roles.includes(PAPEL_GESTOR) || roles.includes('owner')) return PAPEL_GESTOR;
        return PAPEL_CLOSER;
    }

    /**
     * Time do usuário logado, com os membros.
     * @returns {Promise<{team: {id,name}|null, role: string|null, members: Array}>}
     */
    async getMyTeam() {
        try {
            const lista = await this._call('/teams');
            if (!lista.ok) {
                if (lista.semSessao || lista.status === 401) return { team: null, role: null, members: [] };
                const { code, error } = traduzErro(lista.json, lista.status);
                return { team: null, role: null, members: [], code, error };
            }

            const times = lista.json?.teams || [];
            if (times.length === 0) {
                await v4AuthService.setTeamState(null);
                return { team: null, role: null, members: [] };
            }

            // 1 time por usuário nesta fase: o primeiro é o time.
            const time = times[0];
            const uid = await v4AuthService.getUserId();

            const membros = await this._call(`/teams/${time.$id}/memberships`);
            if (!membros.ok) {
                const { code, error } = traduzErro(membros.json, membros.status);
                return { team: { id: time.$id, name: time.name }, role: null, members: [], code, error };
            }

            // A listagem não traz nome/e-mail para sessões de usuário: completamos com o
            // cadastro dos prefs, e com o estado de conta para o próprio usuário.
            const cadastro = await this._lerCadastro(time.$id);
            const eiEstado = await v4AuthService.getState();

            const members = (membros.json?.memberships || []).map(m => {
                const doCadastro = cadastro[m.userId] || {};
                const souEu = m.userId === uid;
                return {
                    membershipId: m.$id,
                    userId: m.userId,
                    name: m.userName || doCadastro.n || (souEu ? (eiEstado?.email || '').split('@')[0] : ''),
                    email: m.userEmail || doCadastro.e || (souEu ? (eiEstado?.email || '') : ''),
                    role: this._papelDaMembership(m.roles),
                    // 'ativo' = aceitou o convite; 'convidado' = ainda não clicou no e-mail.
                    status: m.confirm ? 'ativo' : 'convidado',
                    joinedAt: m.joined || null,
                };
            });

            const eu = members.find(m => m.userId === uid);
            const role = eu?.role || null;

            const estado = { id: time.$id, name: time.name, role };
            await v4AuthService.setTeamState(estado);

            return { team: { id: time.$id, name: time.name }, role, members };
        } catch (err) {
            console.error('[V4Team] getMyTeam falhou:', err.message);
            return { team: null, role: null, members: [], code: 'falha_rede', error: 'Sem conexão com o servidor. Tente novamente.' };
        }
    }

    /** Cria a empresa; quem cria vira gestor. */
    async createTeam(name) {
        const nome = (name || '').trim();
        if (!nome) {
            return { success: false, code: 'nome_vazio', error: 'Dê um nome para a empresa.' };
        }
        try {
            const atual = await this.getMyTeam();
            if (atual.team) {
                return { success: false, code: 'ja_tem_time', error: `Você já faz parte de "${atual.team.name}". Saia dele antes de criar outro.` };
            }

            const r = await this._call('/teams', 'POST', {
                teamId: 'unique()',
                name: nome,
                roles: [PAPEL_GESTOR],
            });
            if (!r.ok) {
                const { code, error } = traduzErro(r.json, r.status);
                console.warn(`[V4Team] createTeam recusado (${code})`);
                return { success: false, code, error };
            }

            const team = { id: r.json.$id, name: r.json.name };

            // O gestor entra no cadastro para aparecer na lista de membros com nome.
            const estado = await v4AuthService.getState();
            const uid = await v4AuthService.getUserId();
            if (uid) {
                await this._registrarNoCadastro(team.id, uid, (estado?.email || '').split('@')[0], estado?.email || '');
            }

            await v4AuthService.setTeamState({ ...team, role: PAPEL_GESTOR });
            console.log(`[V4Team] Time criado: ${team.name} (${team.id})`);
            return { success: true, team, role: PAPEL_GESTOR };
        } catch (err) {
            return this._falhaRede('createTeam', err);
        }
    }

    /**
     * Convida alguém por e-mail. Se o e-mail ainda não tem conta, o Appwrite cria o
     * usuário e manda o convite — a página web oferece "Criar minha senha".
     *
     * Depois de criar a membership, dois ajustes fecham o modelo de permissões:
     *   1. a membership do convidado recebe o papel próprio `c<uid>`;
     *   2. a membership do gestor passa a carregar esse mesmo papel (é o que lhe dá leitura).
     */
    async invite(email, role = PAPEL_CLOSER) { // role: só 'closer' é aceito nesta fase
        const emailLimpo = (email || '').trim();
        if (!emailLimpo) {
            return { success: false, code: 'email_vazio', error: 'Digite o e-mail de quem você quer convidar.' };
        }
        try {
            const { team, role: meuPapel, members } = await this.getMyTeam();
            if (!team) {
                return { success: false, code: 'sem_time', error: 'Crie a empresa antes de convidar alguém.' };
            }
            if (meuPapel !== PAPEL_GESTOR) {
                return { success: false, code: 'sem_permissao', error: 'Só o gestor pode convidar pessoas para o time.' };
            }
            if (members.some(m => (m.email || '').toLowerCase() === emailLimpo.toLowerCase())) {
                return { success: false, code: 'ja_no_time', error: 'Esta pessoa já está no time.' };
            }

            // Nesta fase a empresa tem um único gestor: um segundo gestor não seria owner do
            // time (não conseguiria administrar memberships) nem acumularia os papéis
            // c<uid> dos closers (não veria nada). Recusar é mais honesto do que aceitar
            // e entregar um gestor que não funciona.
            if (role === PAPEL_GESTOR) {
                return { success: false, code: 'papel_gestor_indisponivel', error: 'Nesta versão a empresa tem um único gestor. Convide como closer.' };
            }
            const papelPedido = PAPEL_CLOSER;

            const criada = await this._call(`/teams/${team.id}/memberships`, 'POST', {
                email: emailLimpo,
                roles: [papelPedido],
                url: CONVITE_URL,
            });
            if (!criada.ok) {
                const { code, error } = traduzErro(criada.json, criada.status);
                console.warn(`[V4Team] Convite recusado (${code})`);
                return { success: false, code, error };
            }

            const membershipId = criada.json.$id;
            const convidadoUid = criada.json.userId;
            const papelProprio = papelDoCloser(convidadoUid);

            // 1. papel próprio na membership do convidado
            const ajuste = await this._call(`/teams/${team.id}/memberships/${membershipId}`, 'PATCH', {
                roles: [papelPedido, papelProprio],
            });
            if (!ajuste.ok) {
                console.warn('[V4Team] Não foi possível dar o papel próprio ao convidado:', ajuste.json?.message);
            }

            // 2. cadastro (nome/e-mail) — a listagem de memberships não os devolve
            await this._registrarNoCadastro(
                team.id, convidadoUid,
                criada.json.userName || emailLimpo.split('@')[0],
                criada.json.userEmail || emailLimpo,
            );

            // 3. o gestor acumula o papel do convidado — é isso que lhe dá leitura
            const concedido = await this._concederPapelAoGestor(team.id, papelProprio);
            if (!concedido.success) {
                console.warn('[V4Team] Papel do convidado não entrou na membership do gestor:', concedido.error);
            }

            console.log(`[V4Team] Convite enviado para ${emailLimpo} (${papelPedido}).`);
            return {
                success: true,
                member: {
                    membershipId,
                    userId: convidadoUid,
                    email: emailLimpo,
                    name: criada.json.userName || '',
                    role: papelPedido,
                    status: criada.json.confirm ? 'ativo' : 'convidado',
                },
            };
        } catch (err) {
            return this._falhaRede('invite', err);
        }
    }

    /** Acrescenta um papel à membership do gestor (idempotente). */
    async _concederPapelAoGestor(teamId, papel) {
        const uid = await v4AuthService.getUserId();
        const membros = await this._call(`/teams/${teamId}/memberships`);
        if (!membros.ok) {
            const { code, error } = traduzErro(membros.json, membros.status);
            return { success: false, code, error };
        }
        const minha = (membros.json?.memberships || []).find(m => m.userId === uid);
        if (!minha) {
            return { success: false, code: 'sem_membership', error: 'Você não é membro deste time.' };
        }
        const roles = Array.from(new Set([...(minha.roles || []), papel]));
        const r = await this._call(`/teams/${teamId}/memberships/${minha.$id}`, 'PATCH', { roles });
        if (!r.ok) {
            const { code, error } = traduzErro(r.json, r.status);
            return { success: false, code, error };
        }
        return { success: true };
    }

    /**
     * Remove um membro. A permissão já gravada nos documentos dele NÃO some sozinha —
     * quem revoga a leitura é a retirada do papel `c<uid>` da membership do gestor.
     */
    async removeMember(membershipId) {
        if (!membershipId) {
            return { success: false, code: 'sem_membro', error: 'Membro não informado.' };
        }
        try {
            const { team, role: meuPapel, members } = await this.getMyTeam();
            if (!team) {
                return { success: false, code: 'sem_time', error: 'Você não faz parte de nenhuma empresa.' };
            }
            if (meuPapel !== PAPEL_GESTOR) {
                return { success: false, code: 'sem_permissao', error: 'Só o gestor pode remover pessoas do time.' };
            }

            const alvo = members.find(m => m.membershipId === membershipId);
            if (!alvo) {
                return { success: false, code: 'membro_nao_encontrado', error: 'Este membro não está mais no time.' };
            }

            const uid = await v4AuthService.getUserId();
            if (alvo.userId === uid) {
                return { success: false, code: 'gestor_nao_se_remove', error: 'Para sair da empresa, use "Sair do time".' };
            }

            const apagada = await this._call(`/teams/${team.id}/memberships/${membershipId}`, 'DELETE');
            if (!apagada.ok) {
                const { code, error } = traduzErro(apagada.json, apagada.status);
                return { success: false, code, error };
            }

            await this._removerDoCadastro(team.id, alvo.userId);

            // Revoga a leitura: sem o papel, o gestor deixa de enxergar os documentos.
            const revogado = await this._revogarPapelDoGestor(team.id, papelDoCloser(alvo.userId));
            if (!revogado.success) {
                console.warn('[V4Team] Membro removido, mas o papel seguiu no gestor:', revogado.error);
                return {
                    success: true,
                    aviso: 'Membro removido, mas a leitura das calls antigas pode levar alguns instantes para ser revogada.',
                };
            }

            console.log(`[V4Team] Membro ${alvo.email} removido do time ${team.name}.`);
            return { success: true };
        } catch (err) {
            return this._falhaRede('removeMember', err);
        }
    }

    /** Tira um papel da membership do gestor (idempotente). */
    async _revogarPapelDoGestor(teamId, papel) {
        const uid = await v4AuthService.getUserId();
        const membros = await this._call(`/teams/${teamId}/memberships`);
        if (!membros.ok) {
            const { code, error } = traduzErro(membros.json, membros.status);
            return { success: false, code, error };
        }
        const minha = (membros.json?.memberships || []).find(m => m.userId === uid);
        if (!minha) return { success: false, code: 'sem_membership', error: 'Você não é membro deste time.' };

        const roles = (minha.roles || []).filter(r => r !== papel);
        const r = await this._call(`/teams/${teamId}/memberships/${minha.$id}`, 'PATCH', { roles });
        if (!r.ok) {
            const { code, error } = traduzErro(r.json, r.status);
            return { success: false, code, error };
        }
        return { success: true };
    }

    /**
     * Sai do time. O gestor só sai se for o único membro (aí o time é apagado) — senão
     * a empresa ficaria sem quem administra, e não há transferência de posse nesta fase.
     */
    async leave() {
        try {
            const { team, role, members } = await this.getMyTeam();
            if (!team) {
                return { success: false, code: 'sem_time', error: 'Você não faz parte de nenhuma empresa.' };
            }

            const uid = await v4AuthService.getUserId();
            const minha = members.find(m => m.userId === uid);
            if (!minha) {
                await v4AuthService.setTeamState(null);
                return { success: true };
            }

            if (role === PAPEL_GESTOR && members.length > 1) {
                return {
                    success: false,
                    code: 'gestor_com_membros',
                    error: 'Você é o gestor: remova as outras pessoas antes de sair da empresa.',
                };
            }

            if (role === PAPEL_GESTOR) {
                const apagado = await this._call(`/teams/${team.id}`, 'DELETE');
                if (!apagado.ok) {
                    const { code, error } = traduzErro(apagado.json, apagado.status);
                    return { success: false, code, error };
                }
            } else {
                const saiu = await this._call(`/teams/${team.id}/memberships/${minha.membershipId}`, 'DELETE');
                if (!saiu.ok) {
                    const { code, error } = traduzErro(saiu.json, saiu.status);
                    return { success: false, code, error };
                }
            }

            await v4AuthService.setTeamState(null);
            console.log(`[V4Team] Saiu do time ${team.name}.`);
            return { success: true };
        } catch (err) {
            return this._falhaRede('leave', err);
        }
    }

    // -----------------------------------------------------------------------
    // Visão do gestor: as calls do time, lidas direto da nuvem.
    // A consulta não filtra por time — quem filtra é a permissão: o gestor só
    // enxerga os documentos que carregam um papel `c<uid>` que ele possui.
    // -----------------------------------------------------------------------

    _queryString(queries) {
        return queries.map(q => `queries[]=${encodeURIComponent(JSON.stringify(q))}`).join('&');
    }

    /**
     * Sessões do time, mais novas primeiro, com o dono resolvido pelos membros.
     * @returns {Promise<{success: boolean, sessions?: Array, error?: string}>}
     */
    async teamSessions({ limit = 50 } = {}) {
        try {
            const { team, role, members } = await this.getMyTeam();
            if (!team) {
                return { success: false, code: 'sem_time', error: 'Você não faz parte de nenhuma empresa.' };
            }
            if (role !== PAPEL_GESTOR) {
                return { success: false, code: 'sem_permissao', error: 'Só o gestor vê as reuniões do time.' };
            }

            const teto = Math.max(1, Math.min(Number(limit) || 50, 100));
            const qs = this._queryString([
                { method: 'orderDesc', attribute: 'started_at' },
                { method: 'limit', values: [teto] },
            ]);

            const r = await this._call(`/databases/${APPWRITE_DATABASE_ID}/collections/sessions/documents?${qs}`);
            if (!r.ok) {
                const { code, error } = traduzErro(r.json, r.status);
                return { success: false, code, error };
            }

            const porUid = new Map(members.map(m => [m.userId, m]));
            const uidGestor = await v4AuthService.getUserId();

            const sessions = (r.json?.documents || []).map(doc => {
                const dono = porUid.get(doc.uid);
                return {
                    id: doc.$id,
                    uid: doc.uid,
                    title: doc.title || 'Sessão sem título',
                    session_type: doc.session_type || 'listen',
                    started_at: doc.started_at || null,
                    ended_at: doc.ended_at || null,
                    owner: {
                        userId: doc.uid,
                        name: dono?.name || (doc.uid === uidGestor ? 'Você' : 'Membro removido'),
                        email: dono?.email || '',
                    },
                };
            });

            return { success: true, team, sessions };
        } catch (err) {
            return this._falhaRede('teamSessions', err);
        }
    }

    /** Transcrição de uma reunião do time, lida da nuvem em ordem cronológica. */
    async teamTranscripts(sessionId) {
        if (!sessionId) {
            return { success: false, code: 'sem_sessao_alvo', error: 'Reunião não informada.' };
        }
        try {
            const qs = this._queryString([
                { method: 'equal', attribute: 'session_id', values: [sessionId] },
                { method: 'orderAsc', attribute: 'start_at' },
                { method: 'limit', values: [1000] },
            ]);
            const r = await this._call(`/databases/${APPWRITE_DATABASE_ID}/collections/transcripts/documents?${qs}`);
            if (!r.ok) {
                const { code, error } = traduzErro(r.json, r.status);
                return { success: false, code, error };
            }
            const transcripts = (r.json?.documents || []).map(d => ({
                id: d.$id,
                session_id: d.session_id,
                speaker: d.speaker,
                text: d.text,
                start_at: d.start_at,
                end_at: d.end_at,
            }));
            if (transcripts.length === 0) {
                return { success: false, code: 'sem_transcricao', error: 'Esta reunião não tem transcrição na nuvem.' };
            }
            return { success: true, transcripts };
        } catch (err) {
            return this._falhaRede('teamTranscripts', err);
        }
    }

    /** Uma sessão da nuvem pelo id (metadados para montar o contexto da conversa). */
    async getCloudSession(sessionId) {
        if (!sessionId) return null;
        try {
            const r = await this._call(`/databases/${APPWRITE_DATABASE_ID}/collections/sessions/documents/${sessionId}`);
            if (!r.ok) return null;
            const d = r.json;
            return {
                id: d.$id,
                uid: d.uid,
                title: d.title,
                started_at: d.started_at,
                ended_at: d.ended_at,
                session_type: d.session_type,
            };
        } catch (err) {
            console.warn('[V4Team] getCloudSession falhou:', err.message);
            return null;
        }
    }

    /** Mensagens da conversa do gestor sobre uma reunião do time, em ordem cronológica. */
    async cloudAiMessages(sessionId) {
        if (!sessionId) return { success: true, messages: [] };
        try {
            const qs = this._queryString([
                { method: 'equal', attribute: 'session_id', values: [sessionId] },
                { method: 'orderAsc', attribute: 'sent_at' },
                { method: 'limit', values: [200] },
            ]);
            const r = await this._call(`/databases/${APPWRITE_DATABASE_ID}/collections/ai_messages/documents?${qs}`);
            if (!r.ok) {
                const { code, error } = traduzErro(r.json, r.status);
                return { success: false, code, error, messages: [] };
            }
            const messages = (r.json?.documents || []).map(d => ({
                id: d.$id,
                session_id: d.session_id,
                role: d.role,
                content: d.content,
                sent_at: d.sent_at,
                model: d.model,
            }));
            return { success: true, messages };
        } catch (err) {
            return { ...this._falhaRede('cloudAiMessages', err), messages: [] };
        }
    }

    /**
     * Grava uma mensagem da conversa do gestor NA SESSÃO DO CLOSER, na nuvem.
     * Permissões: o gestor administra o documento e o dono da call também lê — o papel
     * `c<uid-do-dono>` é justamente um papel que o gestor possui, então ele pode concedê-lo.
     */
    async addCloudAiMessage({ sessionId, ownerUid, role, content, model }) {
        try {
            // Esta função roda duas vezes por pergunta (pergunta + resposta). Usa o estado
            // guardado em vez de reler o time do servidor a cada mensagem — o gestor só
            // chega aqui depois de listar o time, e quem autoriza de verdade é a
            // permissão do documento no servidor. Sem estado guardado, lê uma vez.
            let estado = await v4AuthService.getTeamState();
            if (!estado?.id) {
                const lido = await this.getMyTeam();
                estado = lido.team ? { ...lido.team, role: lido.role } : null;
            }
            if (!estado?.id || estado.role !== PAPEL_GESTOR) {
                return { success: false, code: 'sem_permissao', error: 'Só o gestor conversa com as reuniões do time.' };
            }
            const team = { id: estado.id, name: estado.name };
            const uid = await v4AuthService.getUserId();
            const now = Math.floor(Date.now() / 1000);

            const permissions = [
                `read("user:${uid}")`,
                `update("user:${uid}")`,
                `delete("user:${uid}")`,
            ];
            // O dono da call lê a conversa que o gestor teve sobre ela.
            if (ownerUid && ownerUid !== uid) {
                permissions.push(`read("team:${team.id}/${papelDoCloser(ownerUid)}")`);
            }

            const r = await this._call(`/databases/${APPWRITE_DATABASE_ID}/collections/ai_messages/documents`, 'POST', {
                documentId: 'unique()',
                data: {
                    uid: ownerUid || uid,
                    session_id: sessionId,
                    sent_at: now,
                    role,
                    content,
                    model: model || 'unknown',
                    created_at: now,
                    updated_at: now,
                },
                permissions,
            });
            if (!r.ok) {
                const { code, error } = traduzErro(r.json, r.status);
                console.warn(`[V4Team] Falha ao gravar ai_message na nuvem (${code})`);
                return { success: false, code, error };
            }
            return { success: true, id: r.json.$id };
        } catch (err) {
            return this._falhaRede('addCloudAiMessage', err);
        }
    }
}

const v4TeamService = new V4TeamService();

module.exports = v4TeamService;
module.exports.papelDoCloser = papelDoCloser;
module.exports.PAPEL_GESTOR = PAPEL_GESTOR;
module.exports.PAPEL_CLOSER = PAPEL_CLOSER;
module.exports.PAPEIS_ESTRUTURAIS = PAPEIS_ESTRUTURAIS;
