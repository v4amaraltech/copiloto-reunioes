# Times / Empresa — o gestor vê as reuniões dos closers

> Escrito em 2026-09-03, **medindo contra o Appwrite real** (self-hosted 1.7.4) antes de
> escrever o código. As decisões abaixo que divergem do plano original divergem porque o
> servidor recusou o plano original — cada uma está marcada com o erro que a motivou.

---

## 1. Modelo

| Conceito | No Appwrite |
|---|---|
| Empresa | um **Team** nativo |
| Gestor | membership com papel `gestor` (quem cria o time é gestor e `owner`) |
| Closer | membership com papel `closer` |
| Vínculo | 1 usuário pertence a **no máximo 1 time** nesta fase |

Convite por e-mail via `POST /teams/{id}/memberships`, com `url` apontando para
`https://conta.v4companyamaral.com/convite`. Se o e-mail ainda não tem conta, o Appwrite
**cria o usuário** e manda o convite — por isso a página de convite oferece "Criar minha
senha" (dispara `POST /account/recovery`, o mesmo fluxo que já existia).

---

## 2. A decisão que mudou: papel por closer

O plano original dizia: todo documento novo ganha
`Permission.read(Role.team(teamId, 'gestor'))`.

**O servidor recusa isso.** Medido:

```
POST /databases/copiloto/collections/sessions/documents   (sessão do closer)
permissions: [ ..., read("team:<teamId>/gestor") ]
→ 401 user_unauthorized
   Permissions must be one of: (any, users, user:<self>, user:<self>/unverified,
   users/unverified, team:<teamId>, member:<membershipId>, team:<teamId>/closer)
```

O Appwrite só deixa um usuário conceder permissões de **papéis que ele mesmo possui**. O
closer tem `team:<id>` e `team:<id>/closer`; não tem `team:<id>/gestor`, então não pode
conceder leitura a ele.

As duas saídas óbvias falham:

| Saída | Por que não |
|---|---|
| `read("team:<teamId>")` — o time inteiro | Aceito pelo servidor (201), **mas todo closer passa a ler as calls dos colegas**. Viola o requisito explícito de isolamento entre closers. |
| `read("user:<uid-do-gestor>")` | Recusado pelo mesmo 401: `user:<outro>` não está na lista de papéis do autor. |

**O que foi adotado — um papel por closer, que o gestor acumula:**

- ao entrar no time, o closer recebe os papéis `['closer', 'c<uid-dele>']`;
- a membership do **gestor** acumula os papéis `c<uid>` de todos os closers;
- todo documento do closer leva `read("team:<teamId>/c<uid-do-dono>")`.

Resultado (medido, 10/10):

| Quem | Lê a call do closer A? |
|---|---|
| o próprio closer A | sim (`read("user:A")`) |
| o gestor | **sim** — ele carrega o papel `c<A>` |
| closer B, do mesmo time | **não** — 404 `document_not_found`; e `listDocuments` devolve `total: 0` |

O nome do papel é derivado do uid (`'c' + uid sem caracteres especiais`, ≤ 31 chars), então é
determinístico: não há estado extra para guardar, e o *backfill* sabe qual papel aplicar a
cada documento antigo sem consultar nada.

### Revogação

Remover o membro **não basta**: a permissão fica gravada no documento. `removeMember()` faz as
duas coisas, nesta ordem: apaga a membership do closer **e** tira o papel `c<uid>` da
membership do gestor. Medido: depois disso o gestor recebe 404 nos documentos daquele closer,
sem precisar reescrever documento nenhum.

### Estado local desatualizado (closer removido com o app fechado)

O estado do time fica no Keychain e só é relido do servidor quando o usuário abre a
aba de Times. Se o gestor remove o closer enquanto o app dele está fechado, o
próximo envio pós-call tenta conceder `read("team:<id>/c<uid>")` — papel que ele não
tem mais — e o servidor responde 401 `Permissions must be one of: ...`.

Três coisas garantem que isso não perde a call nem derruba a sessão (medido, passos
28b–28f do e2e):

- **o interceptor de 401 do `appwriteClient` ignora esse erro** — ele é de permissão
  de documento, não de sessão; sem isso o closer era deslogado;
- **`uploadSession` relê o time do servidor** (o que limpa o estado, se ele saiu) **e
  reenvia só com as permissões do dono** — a call sobe sem o gestor, e o backfill
  acrescenta a permissão depois, se ele voltar ao time;
- **o boot relê o time no servidor** antes do backfill (não confia só no Keychain), e o
  backfill para no primeiro papel recusado em vez de repetir o erro em centenas de
  documentos.

`setTeamState` só grava e avisa as janelas quando o time **mudou de fato**: a leitura
do time acontece a cada operação, e cada aviso faz a tela de configurações recarregar.

### Custo do modelo

`updateMembership` do gestor a cada convite/remoção (uma chamada). O limite prático é o
número de papéis por membership (100 no Appwrite) — teto de ~99 closers por gestor nesta
fase, muito acima do caso de uso.

---

## 3. Outras medições que dirigiram o código

| Pergunta | Resposta medida |
|---|---|
| A sessão já aberta do closer enxerga o papel novo? | **Sim, sem relogin.** As permissões são resolvidas por requisição. |
| `PATCH /teams/{id}/memberships/{mid}/status` com API key? | **Não** — 401 `general_unauthorized_scope`: é rota *public*, exige `userId`+`secret` do e-mail. Por isso o aceite mora na página web, e o e2e usa `POST /memberships` com `userId` (admin), que já nasce `confirm: true`. |
| O gestor consegue `listDocuments` do que ele lê? | **Sim** — `documentSecurity` filtra por permissão; `orderDesc`+`limit` funcionam. |
| O gestor consegue gravar `ai_messages` na sessão do closer, com leitura para o closer? | **Sim**, usando `read("team:<id>/c<uid-do-closer>")` — papel que o gestor possui. |
| `GET /teams/{id}/memberships` traz nome e e-mail dos membros? | **Não com sessão de usuário** — `userName` e `userEmail` voltam vazios; só a API key os vê. Ver "Cadastro dos membros" abaixo. |
| SDK `node-appwrite` (feito para 1.9.x) contra o 1.7.4 | `teams.*` responde, mas o projeto já padroniza `fetch` direto (v4AuthService) por causa de rotas divergentes. O `v4TeamService` segue esse padrão. |

---

## 4. Onde mora cada coisa

| Arquivo | Papel |
|---|---|
| `src/features/common/services/v4TeamService.js` | time, membros, convite, visão do gestor |
| `src/features/common/services/v4SyncService.js` | aplica a permissão do time no envio pós-call + backfill nos documentos já na nuvem |
| `src/features/common/services/v4AuthService.js` | guarda `team` (id, nome, papel) no mesmo blob do Keychain do estado de conta |
| `web-pages/convite/index.html` | aceite do convite + "Criar minha senha" |
| `scripts/appwrite/e2e-times.js` | e2e contra o servidor real, com contas descartáveis |

### Estado local

`teamId`, nome e papel ficam no **mesmo lugar do estado de conta** (blob do Keychain gravado
pelo `v4AuthService`), atualizados no login e ao entrar/sair de um time. `getState()` passa a
devolver `team: { id, name, role } | null`.

### Cadastro dos membros (nome e e-mail)

A listagem de memberships devolve `userName`/`userEmail` **vazios** para sessões de usuário —
o servidor só entrega esses campos à API key, que o app desktop nunca usa. Sem tratar isso, a
tela do gestor mostraria uma lista de ids.

A solução é o **prefs do time** (`PUT /teams/{id}/prefs`), com um mapa
`{ <userId>: { n: nome, e: email } }`. Medido: só quem administra o time escreve (o closer
recebe 401), e qualquer membro lê — a visibilidade certa para uma lista de colegas. O gestor
grava a entrada no convite e a remove junto com o membro; `getMyTeam()` completa cada
membership com esses dados e usa o estado de conta para o próprio usuário.

### Backfill de permissões

Ao entrar num time, e no boot quando já existe time, os documentos que já estão na nuvem
(`sessions`, `transcripts`, `ai_messages`, `summaries`) recebem a permissão do time via
`updateDocument` **só com `permissions`**. Roda em background, em lotes, com teto por boot
(300 documentos) e pausa entre lotes — não bloqueia a UI e não estoura o servidor.

---

## 5. O que ficou fora desta fase

- **Vários times por usuário**: o modelo aceita, o produto ainda não — `getMyTeam()` devolve o
  primeiro time e o resto do código assume 1.
- **Criptografia por campo**: os textos continuam subindo em claro (paridade com o que já
  existia); quando os repositories migrarem, o gestor precisará da mesma chave.
- **Transferência de posse do time** e mais de um gestor por empresa.
- **Convite em massa** e reenvio de convite pendente.
