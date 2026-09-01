# Migração Supabase → Appwrite — Levantamento (produto vendável)

**Data:** 2026-09-01 · **Status:** LEVANTAMENTO — nada implementado.
**Decisões do usuário já tomadas:**
- **Opção C:** o produto vendável é o copiloto SEM a camada de leads (`briefing-lookup` e `leads-search` fora do escopo). Ficam: escuta, transcrição, sugestões ao vivo, sistema de agentes.
- **Cada cliente traz a própria API key** (fluxo ApiKeyHeader). O `proxy-llm` NÃO será replicado no Appwrite.
- Destino: Appwrite self-hosted em `appwrite.v4companyamaral.com`.

---

## 1. proxy-llm — como funciona hoje e o que sai

**Fluxo atual (confirmado no código):**
1. `v4Config.js` define `V4_LLM_PROXY_URL` (`{supabase}/functions/v1/proxy-llm`) e o placeholder `V4_PROXY_KEY_PLACEHOLDER = 'v4-proxy'`.
2. No login V4, `v4AuthService._activateProxyLlm()` (v4AuthService.js:129) chama `modelStateService.setApiKey('anthropic', 'v4-proxy')` — o placeholder é persistido em `provider_settings` como se fosse uma API key.
3. `providers/anthropic.js` tem 2 ramos que detectam o placeholder: (a) `validateApiKey` curto-circuita a validação (linhas ~6-24); (b) na criação do client, troca por `new Anthropic({ baseURL: V4_LLM_PROXY_URL, apiKey: null, authToken: <JWT do closer> })` (linha ~80-86). A key real da Anthropic vive só na edge function.

**Com a decisão (cliente traz a key), sai do produto — limpeza da mesma natureza do `openai-glass`:**
- `anthropic.js`: os 2 ramos do placeholder (validação + client proxy) e o import do v4Config.
- `v4AuthService.js`: `_activateProxyLlm()` e sua chamada no `login()`.
- `v4Config.js`: `V4_LLM_PROXY_URL` e `V4_PROXY_KEY_PLACEHOLDER`.
- **`modelStateService.js`: ZERO referências ao proxy — nada muda lá.** A validação de key Anthropic simplesmente volta a valer sempre.
- **Atenção (migração de instalações existentes):** closers com `'v4-proxy'` salvo em `provider_settings` ficarão com uma "key" inválida — a migração precisa apagar esse registro (ou o usuário reconfigura pelo ApiKeyHeader).

## 2. save-transcript — o que faz e o destino no Appwrite

**Hoje (`v4SyncService.js`):** ao fim de cada sessão de escuta (`listenService.js:280`), lê do SQLite a sessão + transcrições e monta o payload `{ local_session_id, lead_briefing, started_at, ended_at, transcripts[{seq, speaker, text, spoken_at}] }`; POST em `save-transcript` com o JWT do closer; o server grava no Enriquece e devolve `{ call_session_id, turns }`. **Offline-first:** falhou → sessão entra em `upload-queue.json` (userData) e é reenviada no boot (`index.js:273`, `retryPending`).

**No Appwrite:** vira **escrita direta nas collections** `sessions` + `transcripts` (permissions por documento fazem o enforcement — sem Function). Duas formas:
- (a) **Repositories Appwrite "live"** (padrão da branch de referência): cada transcript é gravado na nuvem na hora. Aposenta o v4SyncService.
- (b) **Manter o v4SyncService adaptado** (recomendado como 1º passo): mesmo fluxo pós-call + fila offline, trocando o POST da edge function por writes no SDK do Appwrite. Preserva o comportamento offline-first já testado e não acopla a escuta ao ar da rede.
- O campo `lead_briefing` sai do payload (escopo C).

## 3. Sistema de agentes e briefing — onde vivem os dados

**Agentes: 100% local, nada no Supabase.**
- Dados: tabela **`prompt_presets` do SQLite** (id, uid, title, prompt, is_default, created_at, sync_state) — CRUD via `settingsService`/`settingsRepository`.
- Agente ativo: **`activePresetId` no electron-store**, por uid (`settingsService.js:276-310`) — escolha *por dispositivo*, não é dado de nuvem.
- Uso: `summaryService.js:183-196` lê `getActivePreset()` e o `promptBuilder.js:15-21` injeta o prompt como "PLAYBOOK DO AGENTE ATIVO". Seletor no MainHeader + CRUD no SettingsView/personalize.
- Migração: **opcional** — sincronizar agentes via collection `prompt_presets` do Appwrite (já existe no provision) dá multi-dispositivo de graça; sem sync, o produto funciona igual.

**Briefing (sai do escopo) — o que desligar/tornar opcional:**
- `listenService.js:174-186`: chamada automática a `fetchBriefing()` no início da sessão (+ evento `briefing-updated`).
- `SummaryView.js`: bloco de UI "Briefing do lead" + busca de leads (`briefingOpen`, `.briefing-*`/`.lead-*` CSS ~235-330, handlers ~486-514, render ~714).
- IPC: `listen:setLeadBriefing` e `v4:searchLeads` (preload.js:202-204 + handlers no featureBridge).
- `v4SyncService`: `fetchBriefing()`, `searchLeads()`, `setLeadBriefing()` e o `lead_briefing` do payload.
- O prompt já tolera briefing vazio (`getSystemPrompt('v4_sales_copilot', '')') — nada quebra.
- Sugestão: remover em vez de "flag opcional" — se a camada de leads voltar como add-on, ela volta como módulo próprio.

## 4. v4AuthService — de base compartilhada para multi-tenant

**Hoje:** os closers autenticam por e-mail/senha na base **compartilhada** do Supabase da V4 (Enriquece AI); tokens no Keychain (keytar) com refresh automático; o JWT é usado pelo proxy-llm e pelas 3 edge functions.
**No produto vendável:** cada cliente tem seu Appwrite com seus próprios usuários. Muda:
- Troca do endpoint de auth: `POST /auth/v1/token` (Supabase) → `account.createEmailPasswordSession()` (Appwrite Account API). O formulário e-mail/senha do SettingsView permanece igual.
- Sessão: o Appwrite usa session secret (não JWT com refresh_token) — o padrão Keychain + interceptor 401 do `appwriteClient` da branch cobre isso.
- Com proxy e briefing fora, o access token só serve para as escritas de transcrição (item 2) e eventual sync de agentes.
- `authService` local (default_user/SQLite) não muda: as duas identidades continuam independentes, como hoje.

## 5. Gap de schema no Appwrite

As 7 collections do Glass (users, sessions, transcripts, ai_messages, summaries, prompt_presets, default_presets — `provision.js` da branch) **cobrem quase tudo**:
- **Agentes:** `prompt_presets` (uid, title, prompt, is_default, created_at, updated_at) já comporta o sistema de agentes deste projeto — `is_active` NÃO vira atributo (é escolha por dispositivo, fica no electron-store).
- **`default_presets`:** usar como seed dos agentes padrão de vendas do produto (leitura pública, sem criptografia) — precisa só de conteúdo, não de schema novo.
- **Transcrição pós-call:** `sessions` + `transcripts` já têm os campos do payload do save-transcript (speaker, text, start_at; `seq` deriva da ordenação por start_at).
- **O que NUNCA sobe:** `provider_settings` (API keys do cliente — ficam locais), `shortcuts`, `permissions`, `ollama_models`, `whisper_models` — tabelas de dispositivo.
- **Campos/collections novos: nenhum obrigatório.** Opcionais: `sessions.lead_briefing (string)` se a camada de leads voltar um dia; renomear `DATABASE_ID` de `'pickleglass'` para algo white-label.

## 6. Reaproveitamento das branches do v4amaraltech/copilotov4

Referência local (SÓ LEITURA): `/Users/mercante/copilotov4`, branch `feat/appwrite-migration`.

| Artefato | Veredicto |
|---|---|
| `appwriteClient.js` (singleton, interceptor 401, modo sessão vs API key) | **Serve quase direto** — mesmo padrão de client deste projeto. |
| `appwriteConverter.js` (criptografia por campo, paridade Firestore) | **Serve** — este projeto usa o mesmo `encryptionService`. |
| 7× `appwrite.repository.js` (ask, preset, session, user, stt, summary, settings) | **Base boa, exige adaptação:** (a) este projeto simplificou os adapters para SQLite-direto na limpeza do Firebase — o padrão `getBaseRepository()` teria de voltar, agora escolhendo Appwrite quando logado; (b) os repositories de preset/settings da branch **não têm** os métodos do sistema de agentes daqui (comparar assinaturas: `getPresetTemplates`, fluxo `is_active`); (c) decidir item 2a vs 2b antes — no modelo (b), só session/stt/summary/preset importam. |
| `scripts/appwrite/provision.js` (7 collections + índices + smoke test) | **Serve direto**, com DATABASE_ID renomeado e seeds de `default_presets` do produto. |
| Function `auth-callback` (session secret via dashboard web + deep link) | **Provavelmente desnecessária aqui:** o login deste projeto é e-mail/senha embutido no app — `createEmailPasswordSession` direto do desktop dispensa o fluxo web/deep link. Guardar se um dia houver SSO/login via navegador. |
| `appwriteAuthService.js` | **Base para o novo v4AuthService** — trocar o fluxo de session secret por e-mail/senha e manter Keychain/refresh. |
| `docs/APPWRITE_MIGRATION.md` | Bom mapa das etapas, mas escrito para o Glass puro — este projeto tem agentes, v4Sync offline-first e briefing que lá não existem. |

## 7. v4Config.js — o que sobra

Praticamente nada: `V4_SUPABASE_URL`, `V4_SUPABASE_ANON_KEY`, `V4_LLM_PROXY_URL` e `V4_PROXY_KEY_PLACEHOLDER` saem todos com o Supabase + proxy. O arquivo é **substituído** por um `appwriteConfig.js` equivalente (endpoint `appwrite.v4companyamaral.com`, project id, database id — com override por env var, padrão que vale manter). Consumidores atuais do v4Config: `anthropic.js` (sai), `v4AuthService.js` (migra), `v4SyncService.js` (migra).

## Ordem sugerida (quando for implementar)

1. Limpeza proxy-llm + briefing/leads (itens 1 e 3) — independente do Appwrite, igual à limpeza openai-glass.
2. Provision no Appwrite do cliente (item 5) + `appwriteConfig`.
3. Novo auth (item 4) — e-mail/senha + Keychain.
4. Transcrição pós-call por escrita direta (item 2b).
5. Opcional: sync de agentes multi-dispositivo (prompt_presets).
