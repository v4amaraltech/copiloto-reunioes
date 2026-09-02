# Vínculo com a reunião e conversa com a call passada

> Levantamento em 2026-09-02, lendo o código e **medindo o banco real do usuário**
> (`~/Library/Application Support/Copiloto V4/pickleglass.db`). Nenhum código alterado.
>
> Problema: 33 sessões, todas chamadas `Session @ <hora>`; 1.361 falas transcritas; nenhuma busca.
> Decisões do usuário: (1) a sessão deve saber a que reunião pertence; (2) prioridade é
> **conversar com a reunião** depois que ela acabou.

---

## 0. O que o código faz hoje (fatos)

| Fato | Onde |
|---|---|
| O título é gerado na criação da sessão, sem nada da conversa: `` `Session @ ${new Date().toLocaleTimeString()}` `` | `src/features/common/repositories/session/sqlite.repository.js:15` |
| A busca **não existe** — a rota devolve 501, com comentário "future task" | `pickleglass_web/backend_node/routes/conversations.js:50` |
| `sessions` tem só `id, uid, title, session_type, started_at, ended_at, sync_state, updated_at` (**não há `members` no schema local** — esse campo é da collection do Appwrite) | `src/features/common/config/schema.js:12` |
| Colunas novas migram sozinhas: o sync de schema chama `updateTable()` e adiciona o que falta | `src/features/common/services/sqliteClient.js:118-131` |
| **FTS5 está disponível** no `better-sqlite3` que embarcamos (verificado rodando sob `ELECTRON_RUN_AS_NODE`) | — |
| Já existe tela de detalhe da sessão no painel web, lendo transcrição + ai_messages | `pickleglass_web/app/activity/details/page.tsx` |
| Já existe tabela `summaries` (16 registros, texto médio de 225 chars) | `schema.js:50` |
| Nada de calendário/EventKit no repo hoje | — |

---

## A) O vínculo com a agenda

### A.1 Como ler o calendário — recomendação

**Recomendo (ii) EventKit do macOS, através de um binário helper em Swift que o app
spawna e que devolve JSON.**

| | (i) Google Calendar API + OAuth próprio | (ii) EventKit (macOS) | (iii) .ics / convite por e-mail |
|---|---|---|---|
| Cobertura de provedores | **Só Google.** Cliente em Outlook/M365 fica de fora | **Todos de uma vez** — lê o que o usuário já configurou no Calendário do macOS (Google, iCloud, Exchange/Outlook) | Depende de o cliente encaminhar convites |
| Burocracia para vender | Projeto no Google Cloud, tela de consentimento e **verificação do app** (o scope de calendário é sensível) — semanas, e refeita a cada mudança de scope | Nenhuma. Uma permissão nativa do macOS | Nenhuma |
| O que o cliente precisa fazer | Login Google + aceitar consentimento | Aceitar um diálogo do sistema | Configurar encaminhamento |
| Esforço de código | OAuth loopback no Electron, refresh token, storage seguro do token | Helper Swift (~150 linhas) + `spawn` — **o padrão já existe no app** (`systemAudioProc` em `sttService.js`) | Parser de .ics + IMAP |
| Portabilidade | Qualquer OS | **Só macOS** | Qualquer OS |

**Por que (ii) para um produto vendável:** o argumento decisivo não é técnico, é comercial.
Com o Google Calendar API, todo cliente que usa Outlook fica de fora e nós assumimos a
burocracia de verificação do Google antes de conseguir vender. Com EventKit, uma
implementação cobre todos os provedores, porque quem já resolveu a sincronização é o macOS —
e o cliente não precisa "conectar" nada, só autorizar. Como o app hoje é macOS-only
(build universal mac), não estamos perdendo alcance.

**Ressalva honesta, que precisa entrar na decisão:** o app é assinado **ad-hoc**, sem
Developer ID. Permissões do macOS (TCC) são amarradas à assinatura do binário, e já temos
histórico de a permissão de captura de tela se perder a cada reinstalação por causa disso.
O acesso ao calendário vai sofrer o mesmo: **risco de o usuário ter que reautorizar a cada
atualização** até existir Developer ID. Isso não invalida a escolha — invalida a promessa de
"configura uma vez" enquanto a assinatura não for resolvida.

**Plano B declarado:** se o roadmap incluir Windows, aí sim vale a Google Calendar API (e a
Microsoft Graph) como segundo conector, com a mesma camada de casamento por cima.

Detalhes de implementação do helper: pedir `NSCalendarsFullAccessUsageDescription` no
Info.plist (via `extendInfo` no `electron-builder.yml`), e o helper expõe dois comandos —
`eventos --de <ts> --ate <ts>` e `permissao` (status da autorização, para a tela de
permissões que o app já tem).

### A.2 Como casar a sessão com o evento

Regra de candidatura, tolerando o atraso de 10 minutos que o usuário citou:

> um evento é candidato se `session.started_at ∈ [event.start − 5min, event.end]`

A janela é assimétrica de propósito: a call raramente começa **antes** da hora marcada, mas
atrasa com frequência. Aceitar até o fim do evento cobre o atraso de 10 min sem inventar
tolerância para trás.

Desempate quando há mais de um candidato (eventos sobrepostos), nesta ordem:

1. descarta eventos *all-day*, os que o usuário **recusou**, e os sem participantes (bloqueios de foco);
2. prefere evento **com link de conferência** (Meet/Zoom/Teams) — sinal forte de que é uma call;
3. prefere o de **menor distância** entre `started_at` e `event.start`;
4. prefere o de **duração mais próxima** da duração real da sessão (só dá para aplicar no fim da call).

**Se ainda houver empate, não adivinhar.** Gravar os candidatos e perguntar: ao encerrar a
sessão, a tela de detalhe mostra "Esta call foi: [A] [B] [nenhuma delas]". Um vínculo errado
e silencioso é pior do que um título genérico, porque contamina a busca e a conversa.

O campo `calendar_match` registra como o vínculo foi feito (`auto` / `confirmado` / `manual` /
`nenhum`), para sabermos com que frequência o casamento automático acerta.

### A.3 O que guardar — campos novos em `sessions`

Todos migram sozinhos ao serem acrescentados em `schema.js` (o `updateTable` adiciona colunas
faltantes). Timestamps em Unix seconds, como o resto do schema:

| Coluna | Tipo | Para quê |
|---|---|---|
| `calendar_event_id` | TEXT | id do evento (EventKit `eventIdentifier`) |
| `calendar_occurrence_at` | INTEGER | data da ocorrência — **necessário para evento recorrente**, cujo id se repete |
| `calendar_title` | TEXT | vira a base do título da sessão |
| `calendar_organizer` | TEXT | quem convocou |
| `calendar_attendees` | TEXT (JSON) | `[{nome, email}]` — é o que permite buscar "a call da Acme" |
| `calendar_start_at` / `calendar_end_at` | INTEGER | horário previsto (≠ do real) |
| `calendar_link` | TEXT | URL da conferência |
| `calendar_match` | TEXT | `auto` \| `confirmado` \| `manual` \| `nenhum` |

O `title` da sessão passa a ser preenchido a partir do `calendar_title`, deixando de ser
`Session @ ...`.

### A.4 Fallback quando não há evento na agenda

**Título gerado por IA a partir da própria transcrição**, uma chamada curta ao encerrar a
sessão: manda as primeiras ~40 falas e pede *"nomeie esta reunião em até 8 palavras"*.
Custa poucos centavos de milésimo e resolve o problema das 33 sessões idênticas **sem
depender de nada nativo** — inclusive retroativamente, para as que já existem.

Ordem de preferência do título: `calendar_title` → título gerado por IA → `Session @ <hora>`.

---

## B) Conversar com a reunião

### B.1 Como o `askService` funciona hoje

`src/features/ask/askService.js`, método `sendMessage(userPrompt, conversationHistoryRaw)`:

1. `sessionRepository.getOrCreateActive('ask')` — **sempre grava numa sessão "ask" nova/ativa** (linha 249);
2. **tira um screenshot da tela** e manda como imagem (linhas 259, 291-295);
3. o histórico vem **do renderer**, já pronto, e é cortado em `slice(-30)` — as últimas 30 falas (linha 213);
4. monta `getSystemPrompt('v4_ask', agentContext, false)` e faz streaming.

Ou seja: ele é desenhado para o **ao vivo** — tela atual + janela curta da conversa em curso.

### B.2 O que precisa mudar

| Hoje | Para conversar com uma call passada |
|---|---|
| `getOrCreateActive('ask')` | aceitar `targetSessionId` e gravar as `ai_messages` **na sessão da reunião** — senão cada pergunta cria mais uma sessão órfã, piorando exatamente o problema que estamos resolvendo |
| histórico vindo do renderer, `slice(-30)` | carregar do banco: `sttRepository.getAllTranscriptsBySessionId(sessionId)`, **inteira** (ver B.3) |
| screenshot sempre | **não capturar** — a tela de agora não tem relação com uma call de ontem, e ainda custa tokens de imagem |
| prompt `v4_ask` ("responda ao closer no meio da call") | um template novo, `v4_ask_sessao`, com a reunião no passado, ciente de título/participantes/data |

### B.3 O contexto cabe? — medido, não estimado

Medições no banco real:

| | Medido |
|---|---|
| Maior call real | **31,2 min** → 570 falas, **31.951 chars** já formatados como `Speaker: texto` |
| Palavras nessa call | 5.544 |
| Densidade | ~1.030 chars/min de call |
| **Todas as 33 sessões somadas** | **86.479 chars** |

Convertendo para tokens por duas vias que convergem — por chars (÷3,5 para pt-BR) e por
palavras (×1,5):

| Duração | Chars | **Tokens (estimados)** |
|---|---|---|
| 31 min (real, medido) | 32k | **~8.500** |
| 60 min (extrapolado) | ~62k | **~17.500** |
| 90 min (extrapolado) | ~93k | **~26.000** |
| *as 33 sessões juntas* | 86k | *~25.000* |

**Conclusão: cabe com folga, e a resposta é mandar a transcrição inteira.** Uma call de
1 hora ocupa ~14% de uma janela de 128k. **Não precisa de RAG, embeddings, chunking nem
busca semântica na v1** — seria complexidade cara resolvendo um problema que os dados
mostram não existir. Vale reabrir essa decisão só acima de ~90 min de call.

### B.4 Custo — o cliente paga com a própria API key

Por pergunta, a transcrição inteira é reenviada. Com ~17.500 tokens de entrada para uma call
de 1 hora e um modelo de topo na faixa de **US$ 2,50 / 1M tokens de entrada**:

- **~US$ 0,044 por pergunta** (≈ R$ 0,24)
- uma sessão de 20 perguntas sobre a mesma call: **~US$ 0,88**

> Confirmar a tabela de preços vigente do provedor antes de publicar qualquer número ao cliente.

Três reduções, em ordem de custo-benefício:

1. **Prompt caching** — manter a transcrição no início e imutável entre as perguntas da mesma
   conversa. Leituras de cache custam uma fração do preço normal; da 2ª pergunta em diante o
   custo cai muito. É a otimização de maior retorno e o `summaryService` **já foi escrito
   pensando nisso** ("system prompt estável (bom para prompt caching)").
2. **Usar o `summaries` que já temos** para perguntas panorâmicas ("como foi a call?"), caindo
   para a transcrição inteira só quando a pergunta pede detalhe ("o que ele disse sobre preço?").
   Fica para depois — adiciona uma decisão de roteamento que pode errar.
3. **Modelo menor** para essa tela: perguntar sobre um texto que já está no prompt é tarefa
   fácil; um modelo da faixa "mini" custa ~1/15 e provavelmente basta.

### B.5 Onde a conversa acontece

**Na tela de detalhe da sessão, no painel web** (`pickleglass_web/app/activity/details`), que
já existe e já lê transcrição + `ai_messages`. Razões: depois da call o usuário está sentado,
quer ler, rolar a transcrição e copiar trechos — a janela flutuante existe para o oposto
disso (ocupar pouco espaço durante a call, sem roubar foco). A flutuante continua sendo o
Ask ao vivo, sem mudança.

---

## C) Ordem de entrega

A prioridade declarada é *conversar com a reunião*. Só que, para conversar, o usuário precisa
**escolher qual** reunião — e hoje as 33 se chamam igual. Por isso a fatia 1 é o mínimo que
faz a prioridade funcionar de ponta a ponta, e não um desvio dela.

**Fatia 1 — dar nome e achar (dias, zero dependência nativa)**
- título por IA no fim da sessão + *backfill* das 33 existentes;
- busca com **FTS5** (já disponível) sobre `transcripts` + `sessions.title`;
- implementar a rota `/search` que hoje devolve 501, e um campo de busca na tela de atividade.
- *Valor: o usuário acha a call do cliente X hoje, sem depender de calendário nem de assinatura.*

**Fatia 2 — conversar com a reunião (a prioridade dele)**
- `askService` com `targetSessionId`, transcrição inteira do banco, sem screenshot, prompt novo;
- caixa de pergunta na tela de detalhe, com as respostas gravadas na própria sessão;
- prompt caching desde o início.

**Fatia 3 — vínculo com a agenda**
- helper Swift EventKit + permissão + casamento com desempate + confirmação quando ambíguo;
- campos novos em `sessions`; título do calendário passa à frente do título por IA.
- *Depende de decidir o Developer ID, senão a permissão se perde a cada atualização.*

**Fatia 4 — depois**
- participantes como entidade de verdade ("todas as calls da Acme");
- Google Calendar / Microsoft Graph, se houver Windows;
- roteamento resumo-vs-transcrição e busca semântica, **só se** as calls passarem de ~90 min.
