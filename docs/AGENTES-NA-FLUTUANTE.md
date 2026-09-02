# Agentes dentro da janela flutuante — levantamento e proposta

Objetivo: hoje "criar / editar agente" abre o navegador em `http://localhost:<porta>/personalize?desktop=true`.
O copiloto é usado durante calls, e sair para o navegador quebra o contexto. Este documento levanta o
fluxo atual, confirma onde mora a regra de negócio e propõe um desenho para trazer o menu para dentro
da janela flutuante.

Status: **implementado, com um desvio do desenho original.** A tela de agentes NÃO virou um header
próprio da janela flutuante — não existe o tipo `agents` no `HeaderController` nem o evento
`show-agents-header`. Lista e editor vivem dentro da **aba Agentes da janela de configurações**,
junto de Conta, Modelos & API, Atalhos e Geral, tudo em `src/ui/settings/SettingsView.js`.
As seções abaixo ficam como histórico do levantamento.

---

## 1. O fluxo atual

### O que abre o navegador

Um único ponto, chamado de três lugares:

| Origem | Arquivo | Linha |
|---|---|---|
| Botão "Criar / editar agentes" (aba **Agentes**) | `src/ui/settings/SettingsView.js` | 1587 |
| Link "Criar seu primeiro agente" (lista vazia) | `src/ui/settings/SettingsView.js` | 1573 |
| Botão "Abrir painel web" (aba **Geral**) | `src/ui/settings/SettingsView.js` | 1640 |

Os três chamam `handlePersonalize()` (`SettingsView.js:1293`) →
`window.api.settingsView.openPersonalizePage()` (`preload.js:213`) →
IPC `open-personalize-page` (`bridge/windowBridge.js:20`) →
`windowManager.openLoginPage()` (`window/windowManager.js:433-437`), que monta
`${pickleglass_WEB_URL}/personalize?desktop=true` e chama `shell.openExternal(...)`.

Ou seja: **o gatilho não está no `MainHeader`**. O seletor de agente do header
(`MainHeader.js:777-782`, `.agent-select`) só **troca o agente ativo** — isso já acontece dentro da
janela, sem navegador. O que sai para o navegador é apenas **criar, editar, duplicar e excluir**.

### O que a rota `/personalize` faz

`pickleglass_web/app/personalize/page.tsx` (365 linhas), tela única mestre-detalhe:

- **Coluna esquerda:** lista de todos os agentes (padrão + do usuário), colapsável.
- **Área principal:** `<textarea>` com o prompt do agente selecionado.
- **Ações:** criar (nome via `prompt()` do browser), duplicar, excluir (com `confirm()`),
  ativar/desativar, salvar (habilitado só quando há alteração — `isDirty`).
- **Regra de leitura:** agentes com `is_default = 1` não são editáveis; a UI manda duplicar antes.
- **Campos por agente:** apenas **`title`** e **`prompt`**. Nada além disso.

Os dados chegam por REST no backend local (`pickleglass_web/backend_node/routes/presets.js`), que
por sua vez faz uma ponte IPC para o processo principal.

---

## 2. A lógica de dados — confirmado

**Sim, é `prompt_presets` no SQLite, e o agente ativo é `activePresetId` no electron-store.**

- Tabela `prompt_presets` (`id`, `uid`, `title`, `prompt`, `is_default`, `created_at`, `updated_at`, `sync_state`).
  CRUD em `src/features/settings/repositories/sqlite.repository.js:3-90`.
  `getPresets` retorna os do usuário **mais** os `is_default = 1`; `update`/`delete` têm guarda
  `AND is_default = 0`, então agente padrão é read-only no banco, não só na UI.
- Agente ativo: `settingsService.getActivePresetId()` / `setActivePreset(id)`
  (`src/features/settings/settingsService.js:277-311`) — grava `activePresetId` no electron-store.
  `getPresets()` decora cada registro com `is_active` derivado desse id (`settingsService.js:258-266`).
- O prompt do agente ativo é consumido em `src/features/common/prompts/promptBuilder.js:17`.
- Toda escrita dispara `presets-updated` para as janelas relevantes (`settingsService.js:329-372`).

**A regra já está toda no processo principal. A tela nova só consome.**

### O que já está exposto ao renderer

| Método | preload | handler |
|---|---|---|
| `getPresets()` | `preload.js:115, 241` | `featureBridge.js:20` → `settings:getPresets` |
| `setActivePreset(id)` | `preload.js:116, 242` | `featureBridge.js:21` → `settings:setActivePreset` |
| `onPresetsUpdated(cb)` | `preload.js:117, 266` | evento `presets-updated` |
| `getPresetTemplates()` | — | `featureBridge.js:75` (sem preload) |

### O que faltaria

`createPreset`, `updatePreset` e `deletePreset` **existem** em
`settingsService.js:325-375` e funcionam, mas **não têm handler `ipcMain.handle`** — hoje só são
alcançáveis pelo dispatcher que serve o backend web (`src/index.js:462-476`).

Falta, então, apenas:

1. Três handlers em `src/bridge/featureBridge.js` (`settings:createPreset`, `settings:updatePreset`,
   `settings:deletePreset`), delegando ao `settingsService` — que já notifica as janelas.
2. Os três métodos correspondentes no `src/preload.js`.

Nenhuma mudança de schema, de repositório ou de regra. **Zero risco para o processo principal.**

> Observação: `create`/`update` gravam `sync_state = 'dirty'`, mas o sync do Appwrite hoje cobre
> transcrições, não presets. É terreno do Forja — nada a fazer aqui.

---

## 3. Precedente na janela — como as telas Lit são montadas

Há **dois padrões distintos** no projeto, e a diferença entre eles decide o desenho.

### Padrão A — troca de header dentro da janela flutuante principal

`HeaderController` (`src/ui/app/HeaderController.js`) faz swap do conteúdo de `#header-container`
via `ensureHeader(type)` (linhas 19-68): limpa o container, cria o elemento e redimensiona a janela.

| Tela | Elemento | Tamanho da janela |
|---|---|---|
| Main | `<main-header>` | 660 × 47 (`_resizeForMain`, linha 210) |
| API key | `<apikey-header>` | 456 × 370-400 (`_resizeForApiKey`, linha 216) |
| Welcome | `<welcome-header>` | 456 × 364 (`_resizeForWelcome`, linha 229) |
| Permissões | `<permission-setup>` | 285 × altura dinâmica (`_resizeForPermissionHeader`, linha 222) |

O resize é pedido pelo próprio componente com um evento `request-resize`
(`HeaderController.js:43-51`), então a altura acompanha o conteúdo.

### Padrão B — janela filha própria

O `SettingsView` **não** usa o padrão A: é uma `BrowserWindow` separada de **760 × 520**
(`windowManager.js:533`), carregando `content.html?view=settings`, roteada por
`PickleGlassApp.js:140`. Mesmo caso da `shortcut-settings`, de **353 × 720**
(`windowManager.js:566`), aberta por um botão de dentro do próprio SettingsView.

### ⚠️ O detalhe que decide tudo

**A janela de settings se esconde sozinha 200ms depois que o mouse sai dela**
(`SettingsView.js:1233` `handleMouseLeave` → `windowManager.js:316-325`).

Isso é ótimo para um menu, e péssimo para edição de texto: o usuário digitaria um prompt, moveria o
mouse para fora, e a tela sumiria — possivelmente com o rascunho. **A janela `shortcut-settings` não
tem esse comportamento**, e é justamente o precedente de "tela de trabalho" do projeto.

---

## 4. O desenho proposto

### Onde a tela vive

**Uma janela dedicada `agents`, no molde da `shortcut-settings`** — não no header de 47px, e não
dentro da janela de settings.

Por quê:

- **Não no header** (padrão A): o header é uma barra de 47px que cresce para no máximo 456×400. Um
  editor de prompt ali disputaria espaço com a barra de ação usada durante a call, e o resize
  constante da janela principal é justamente onde o projeto já teve problema.
- **Não dentro do pane "Agentes" do settings**: pelo auto-hide de 200ms descrito acima. Dava para
  adicionar um "pin", mas isso mexeria no comportamento de *todas* as abas de settings para atender
  só uma — mais risco do que o ganho justifica.
- **Janela dedicada**: reaproveita um caminho que já existe e já funciona (`shortcut-settings`), é
  `alwaysOnTop`, respeita a invisibilidade/content protection como as outras, e o usuário fecha
  quando quiser. Continua "dentro do app", que é o pedido real.

**Tamanho proposto: 420 × 620.** Fica entre a shortcut-settings (353) e a settings (760); largura
suficiente para linhas de prompt legíveis sem virar uma segunda janela grande na tela.

### Navegação — duas telas empilhadas, não lado a lado

Em 420px de largura, lista + editor lado a lado espreme os dois. Melhor alternar:

**Tela 1 — Lista** (é o que abre)

```
┌─ Agentes ───────────────────────── × ┐
│  [ + Novo agente ]                   │
│                                      │
│  ✓ Closer — Reunião (V4)    padrão   │
│    Pré-venda — Ligação      padrão   │
│    Meu agente de renovação      ···  │
│    Follow-up pós-proposta       ···  │
│                                      │
│  Toque no nome para ativar.          │
│  ··· = editar / duplicar / excluir   │
└──────────────────────────────────────┘
```

- ✓ marca o ativo. Clicar no nome ativa (e clicar no ativo volta ao padrão) — mesma regra que já
  existe hoje no pane Agentes.
- Agentes padrão mostram o selo `padrão` e, no `···`, só **Duplicar** (o banco já bloqueia editar).

**Tela 2 — Editor** (abre ao escolher "editar" ou "novo")

```
┌─ ‹ Voltar ── Editar agente ─────── × ┐
│  Nome                                │
│  [ Meu agente de renovação        ]  │
│                                      │
│  Instruções                          │
│  ┌────────────────────────────────┐  │
│  │ Você apoia um closer da V4...  │  │
│  │                                │  │
│  │        (~26 linhas visíveis)   │  │
│  └────────────────────────────────┘  │
│  4.412 caracteres · não salvo        │
│                                      │
│  [ Abrir no navegador ]  [ Salvar ]  │
└──────────────────────────────────────┘
```

- No editor **só o agente em edição fica visível** — a lista sai de cena. É a troca consciente: numa
  janela estreita, dá para ter uma coisa bem feita ou duas espremidas.
- Rodapé fixo, textarea ocupa toda a altura restante. `Cmd+S` salva; "‹ Voltar" com alteração
  pendente pede confirmação.

### Sobre o prompt longo

Os agentes reais hoje têm **4.432 e 1.994 bytes** (~40 linhas) — medido no banco do usuário. Num
textarea de ~380px de largura com fonte de 12px cabem ~26 linhas visíveis, então **um agente típico
cabe em ~1,5 tela de rolagem**. É confortável para revisar e ajustar.

Para o pior caso citado (16KB, ~140 linhas) a rolagem fica longa. Por isso:

**Recomendo manter a rota `/personalize` funcionando, como saída — não removê-la.** O botão
"Abrir no navegador" no rodapé do editor leva para lá, no mesmo agente. A divisão que proponho:

| Na janela flutuante (durante a call) | No navegador (fora da call) |
|---|---|
| Ver a lista, ativar/trocar de agente | Escrever um agente longo do zero |
| Criar um agente rápido, renomear | Reescrita pesada, colar de outro doc |
| Duplicar um padrão e ajustar | Comparar agentes lado a lado |
| Ajuste pontual no prompt, excluir | — |

Isso resolve o pedido real (não sair do app durante a call) sem forçar redação de texto longo num
espaço que não é bom para isso. Escrever um agente novo do zero raramente acontece no meio de uma call.

---

## 5. Tamanho do trabalho e fatias

**Fatia 1 — a primeira versão útil** (a que já entrega o pedido)

- Expor os 3 IPC que faltam (featureBridge + preload) — mecânico, ~30 linhas.
- Registrar a janela `agents` no `windowManager` (case novo em `createFeatureWindow`, entrada no
  `windowPool`, visibilidade) e o `view: 'agents'` no `PickleGlassApp`.
- Novo componente `src/ui/agents/AgentsView.js` com as duas telas acima.
- Trocar os gatilhos de `handlePersonalize` para abrir a janela (mantendo "Abrir painel web" na aba
  Geral apontando para o navegador).

Estimativa: **1 a 1,5 dia.** Risco baixo — não toca em regra de negócio, drag, layout do header nem
nos arquivos de auth/sync.

**Fatia 2 — qualidade de edição**

Contador de caracteres, aviso de alterações não salvas, `Cmd+S`, estados de erro e de lista vazia,
recarregar a lista ao receber `presets-updated` (outra janela editou).

**Fatia 3 — refinamentos**

Busca/filtro quando a lista crescer, "duplicar um padrão" com um clique a partir da lista,
templates a partir de `getPresetTemplates()` (já existe no bridge, falta no preload).

**Fora do escopo**

Sync dos presets com o Appwrite (`sync_state = 'dirty'` já é gravado, mas o serviço de sync não
cobre presets hoje) — terreno do Forja. E a rota `/personalize` continua existindo.
