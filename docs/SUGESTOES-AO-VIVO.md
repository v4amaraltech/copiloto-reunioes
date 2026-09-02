# Sugestões ao vivo — levantamento e proposta

> Levantamento feito lendo o código em 2026-09-02. Nenhuma alteração de código foi feita.
> Problema relatado pelo usuário: *"ele faz sugestões em cima de sugestões e o closer ou pré-venda não consegue ler."*
> Objetivo: **uma sugestão por frase que o lead terminar**, tolerando pausa de ~1s no meio da fala.

---

## 1. O mecanismo atual, em detalhe

O caminho de uma sugestão atravessa quatro camadas. Três delas já têm freios, colocados
pelos commits `50deb2a` ("hold do canal Them + debounce 1500ms") e `2dd1310` ("freio,
cooldown, tela congelada, MANTER").

### Camada 1 — `src/features/listen/stt/sttService.js` (fecha o turno)

Debounce por canal, com timer reiniciado a cada trecho recebido:

| Constante | Valor | Linha | Papel |
|---|---|---|---|
| `MY_COMPLETION_DEBOUNCE_MS` | `2000` | 8 | fecha o turno do closer |
| `THEIR_COMPLETION_DEBOUNCE_MS` | `1500` | 11 | fecha o turno do lead — **é este que decide "o lead terminou"** |

`debounceTheirCompletion(text)` (linha 154) faz três coisas: dispara `onThemActivity()`,
acumula o texto no buffer e reagenda `flushTheirCompletion()` para daqui a 1500ms.
`flushTheirCompletion()` (linha 106) emite `onTranscriptionComplete('Them', texto)`.

No handler do Deepgram (linhas 396-420) o fluxo é:

```js
const isFinal = message.is_final;
if (isFinal) {
    this.theirCurrentUtterance = '';
    this.debounceTheirCompletion(text);      // <- único ponto que arma o flush E o hold
} else {
    if (this.theirCompletionTimer) clearTimeout(this.theirCompletionTimer);
    this.theirCompletionTimer = null;        // <- interim cancela o timer e não avisa ninguém
    this.theirCurrentUtterance = text;
    /* envia parcial para a tela */
}
```

### Camada 2 — `src/features/listen/summary/summaryService.js` (decide se gera)

`onTranscriptionComplete` → `listenService.handleTranscriptionComplete` (linha 105) →
`summaryService.addConversationTurn` → `triggerAnalysisIfNeeded(speaker)` (linha 286),
que só reage a `them`. `_maybeRunAnalysis()` (linha 292) aplica três travas:

| Constante | Valor | Linha | Contado desde |
|---|---|---|---|
| `SUGGESTION_COOLDOWN_MS` | `8000` | 11 | `lastSuggestionAt` — fim do stream da última sugestão **exibida** |
| `ME_SPEAKING_HOLD_MS` | `2500` | 12 | `lastMeActivityAt` — última fala do closer |
| `THEM_QUIET_HOLD_MS` | `1200` | 15 | `lastThemActivityAt` — última "atividade" do lead |

```js
const waitMs = Math.max(cooldownLeft, meHoldLeft, themHoldLeft, 0);
```

Se `waitMs > 0`, reagenda a si mesmo. `analysisInFlight` serializa (uma análise por vez) e
`analysisPending` coalesce a rajada; no `finally` (linha 340) chama `_maybeRunAnalysis()` de novo.

### Camada 3 — o prompt (evita repetir)

`makeOutlineAndRequests` (linha 157) injeta o bloco `antiRepeat` (linha 184) com a última
sugestão e instrui o modelo a responder `MANTER` se ela ainda vale. `_readSseStream`
(linha 99) retém os primeiros 10 caracteres e, se começarem com `MANTER`, **suprime o
stream inteiro** — a tela não é tocada.

### Camada 4 — `src/ui/listen/summary/SummaryView.js` (troca a tela)

No `onSummaryStream` (linha 341), ao **primeiro token** de uma sugestão nova:

```js
if (!this.isStreaming && !done) {
    const atual = this.structuredData?.suggestion;
    if (atual) {
        this.suggestionHistory = [atual, ...this.suggestionHistory].slice(0, 4);
        this.structuredData = { ...this.structuredData, suggestion: '' };  // limpa a área principal
    }
}
```

---

## 2. Por que dispara em cima — causas, por ordem de impacto

### A. O hold do lead é cego exatamente enquanto ele fala  ← causa principal

`notifyThemActivity()` só é chamado de dentro de `debounceTheirCompletion`, e no Deepgram
isso só acontece no ramo `is_final`. **Os `interim_results` — que são justamente o sinal
"ele está falando agora" — não atualizam `lastThemActivityAt`**; o ramo interim apenas
cancela o timer e desenha a parcial.

Consequência concreta: durante uma frase longa o Deepgram passa segundos emitindo só
interims. `lastThemActivityAt` envelhece, `THEM_QUIET_HOLD_MS` (1200ms) vence, e a análise
que estava adiada **dispara no meio da fala do lead**. O freio de 1200ms que existe no papel
para segurar a sugestão é o que menos segura na prática, porque não é alimentado.

### B. `is_final` do Deepgram não significa "terminou de falar"

`is_final` marca fim de **segmento**, não fim de enunciado — o Deepgram fecha segmentos com
frequência dentro de uma fala contínua. O código trata cada um como candidato a fim de turno
e usa apenas *tempo desde o último trecho* como critério. Não existe hoje nenhum conceito
semântico de "o lead terminou": é só um `setTimeout` de 1500ms.

Os sinais certos existem e não são usados (ver item 3).

### C. O cooldown mede a coisa errada e não roda no `MANTER`

`lastSuggestionAt` só é atualizado quando uma sugestão **nova** é exibida (linha 326). Num
`MANTER`, `makeOutlineAndRequests` retorna `null` e o cooldown **não se move** — a próxima
análise pode partir na sequência (gasta LLM, e se dessa vez não vier `MANTER`, a tela troca
sem os 8s de intervalo). Além disso os 8s contam do fim do stream anterior, mas a tela é
limpa no primeiro token do próximo (causa D): o tempo real com o texto completo à vista é
8s **menos** a latência do novo stream.

### D. A UI substitui sem tempo mínimo de leitura

O congelamento do `2dd1310` garante que o texto **não muda sob os olhos** do closer — mas o
faz apagando a sugestão da área principal no primeiro token da próxima. Não há nenhum
`MIN_READ_MS`. Do ponto de vista do closer, a sugestão some antes de ele terminar de ler,
e o que ele vê é uma nova sendo digitada por cima.

### E. A rajada coalescida re-dispara sozinha

Toda fala do lead durante uma análise deixa `analysisPending = true`; no `finally` a
`_maybeRunAnalysis()` agenda a próxima para o instante exato em que o cooldown vencer.
Enquanto o lead falar, isso encadeia uma sugestão a cada 8s indefinidamente.

**Resposta direta à pergunta:** não é "debounce curto demais" nem "falta cooldown". É
**gatilho errado** (fim de segmento + timeout, em vez de fim de fala), **o hold certo não
sendo alimentado** durante a fala (A), e **a UI trocando sem contrato de leitura** (D).

---

## 3. Como o fim de fala é detectado hoje

**Hoje: só tempo.** 1500ms sem novo trecho `is_final` = turno encerrado. Não há conceito de
enunciado.

**O que o provedor oferece e não estamos pedindo** — `src/features/common/ai/providers/deepgram.js`, linhas 48-56:

```js
const qs = new URLSearchParams({
  model: 'nova-3', encoding: 'linear16', sample_rate: ...,
  language: dgLanguage, smart_format: 'true', interim_results: 'true', channels: '1',
});
```

Não pedimos `endpointing`, `utterance_end_ms` nem `vad_events`. Portanto:

- **`speech_final`** — vem dentro do payload `Results`, ou seja **já chega ao `sttService` hoje**
  e simplesmente nunca é lido. Com o `endpointing` no default do provedor (muito curto), ele
  marcaria pausas curtas demais; precisa ser configurado junto.
- **`UtteranceEnd`** — é o evento desenhado exatamente para o caso "pausou 1s e continuou":
  só é emitido após `utterance_end_ms` sem fala. Requer `utterance_end_ms` na querystring.
  **Além disso**, o filtro do provider (linha 81) descartaria o evento, porque ele não tem
  `channel.alternatives[0].transcript`:

  ```js
  if (msg.channel?.alternatives?.[0]?.transcript !== undefined) {
    callbacks.onmessage?.({ provider: 'deepgram', ...msg });
  }
  ```

  São **duas** mudanças necessárias para ter `UtteranceEnd`: a querystring e esse filtro.
- **`SpeechStarted`** (via `vad_events=true`) — daria o "começou a falar" para alimentar o hold
  de forma robusta, sem depender de interims.

Os demais providers têm equivalentes: Gemini já usa `serverContent.turnComplete` (linha 371) e
o OpenAI usa `...transcription.completed` (linha 442). Whisper não tem sinal de fim de enunciado —
para ele o debounce por tempo continua sendo o único caminho.

> **Confirmado na doc oficial do Deepgram (2026-09-02), antes de implementar:**
> `utterance_end_ms` mínimo **1000ms**, e **exige `interim_results=true`** (já tínhamos).
> Evento: `{"type":"UtteranceEnd","channel":[0,2],"last_word_end":3.1}` — sem transcript,
> confirmando que o filtro do provider o descartaria. `endpointing` default **10ms**
> (agressivo, como suspeitado), aceita ms ou `false`. `vad_events`/`SpeechStarted` é
> **opcional** — dispensado, porque os interims já dão o "está falando" com mais frequência.
> `nova-3` suporta tudo. Handling oficial adotado: *"trigger when a transcript with
> `speech_final=true` is received (which may be followed by an `UtteranceEnd` message which
> can be ignored), trigger if you receive an `UtteranceEnd` message with no preceding
> `speech_final=true`"*.
>
> **Divergência corrigida:** a proposta original dizia `endpointing=1000`. Como `speech_final`
> é emitido pelo endpointing, 1000ms fecharia o turno em **1s de silêncio** — exatamente a
> pausa que o usuário disse que não pode encerrar a fala. Implementado **`endpointing=1500`**,
> alinhado ao `utterance_end_ms`.

---

## 4. Proposta: uma sugestão por frase terminada

Princípio: trocar o gatilho de *"passaram 1500ms sem trecho novo"* para *"o provedor confirmou
fim de enunciado"*, e dar à sugestão um **contrato de tempo em tela**.

### 4.1 Ordem de implementação (retorno / custo)

**Passo 1 — alimentar o hold com os interims.  (maior retorno) — IMPLEMENTADO**
Chamar `onThemActivity()` também no ramo interim do Deepgram e no `.delta` do OpenAI. Sozinho,
elimina a maior parte das sugestões nascendo no meio da fala do lead (causa A), sem mexer em
gatilho nem em UI. Se for para fazer uma coisa só, é esta.

**Passo 2 — tempo mínimo de leitura.  (resolve o "não consigo ler") — IMPLEMENTADO**
`MIN_READ_MS` a partir do **último** token da sugestão atual. Implementado no `summaryService`
(e não na UI): como a análise seguinte só parte depois dos 10s, a UI nunca recebe stream novo
antes disso, e o "apagar no primeiro token" passa a acontecer só depois da leitura garantida —
sem precisar tocar na `SummaryView`. Ver item 5.

**Passo 3 — gatilho semântico via Deepgram. — IMPLEMENTADO**
Na querystring: `endpointing=1000`, `utterance_end_ms=1500`, `vad_events=true`. No filtro do
provider, repassar também `UtteranceEnd` e `SpeechStarted`. No `sttService`, `UtteranceEnd` passa
a **fechar o turno** (chamar `flushTheirCompletion()` direto) e `SpeechStarted` passa a alimentar
o hold. O debounce de 1500ms vira **fallback** para Whisper e para queda dos eventos.

**Passo 4 — teto de turno** (ver 4.3). — IMPLEMENTADO

### 4.2 Parâmetros sugeridos

| Parâmetro | Hoje | Proposto | Por quê |
|---|---|---|---|
| `endpointing` (DG) | não enviado (default 10ms) | `1500` | o default fecha o turno em qualquer respiração; 1500ms alinha o `speech_final` ao `utterance_end_ms` para que a pausa de ~1s não encerre a fala |
| `utterance_end_ms` (DG) | não enviado | `1500` | é o parâmetro que **atende literalmente o pedido**: pausa de ~1s não fecha o enunciado, com 500ms de margem |
| `THEIR_COMPLETION_DEBOUNCE_MS` | `1500` | `1500` (vira fallback) | mantém para Whisper/queda de evento; deixa de ser o critério principal |
| `THEM_QUIET_HOLD_MS` | `1200` | `800` | deixa de carregar a detecção (que migra para `UtteranceEnd`), mas passa a ser **de fato alimentado** durante a fala |
| `ME_SPEAKING_HOLD_MS` | `2500` | `2500` | sem evidência de problema |
| `SUGGESTION_COOLDOWN_MS` | `8000` | substituído por `MIN_READ_MS` = `10000` | ver item 5; e deve ser atualizado **também no `MANTER`** |
| `THEM_MAX_TURN_MS` | — | `45000` | novo, ver 4.3 |

### 4.3 E se o lead falar 2 minutos seguidos?

**Não esperar o fim.** Um monólogo real tem pausas naturais acima de 1,5s, então na prática o
`UtteranceEnd` dispara várias vezes ao longo dos 2 minutos e o closer recebe sugestões nos
respiros — que é o comportamento desejado.

Para o caso patológico (fala contínua sem pausa suficiente), propor um **teto**:
`THEM_MAX_TURN_MS = 45000`. Se passar disso sem nenhum fim de enunciado, força um flush parcial
e gera uma sugestão com o que já se tem. Ficar mudo por 2 minutos é pior para o closer do que
uma sugestão baseada em turno incompleto. O teto reinicia a contagem, então um monólogo de
2 minutos rende no máximo ~2 sugestões forçadas — ainda respeitando o `MIN_READ_MS`.

---

## 5. Quanto tempo a sugestão precisa ficar na tela

O prompt limita a resposta a **2 frases em pt-BR** (linha 209), o que dá tipicamente 25-35
palavras. Leitura em tela sob carga cognitiva de call ao vivo — o closer está falando e ouvindo
ao mesmo tempo — fica em torno de 2,5-3 palavras/s, bem abaixo da leitura tranquila.

**Estimativa: ~10-12s.** Proposta: `MIN_READ_MS = 10000`, contado **a partir do último token**
(fim do stream), não do início.

Duas mudanças de comportamento junto:

1. **Reter, não apagar.** Hoje a área principal é limpa no primeiro token da nova sugestão.
   Enquanto o `MIN_READ_MS` não vencer, a nova deve ficar retida (buffer) e a atual permanecer
   inteira na tela. Apagar a anterior antes de a nova estar legível é o pior dos dois mundos, e
   é provavelmente o que o closer percebe como "não consigo ler".
2. **Unificar com o cooldown.** `MIN_READ_MS` substitui `SUGGESTION_COOLDOWN_MS`: em vez de dois
   relógios medindo coisas parecidas em camadas diferentes, um único contrato — *nenhuma
   sugestão é substituída antes de 10s completos em tela*.

Vale expor `MIN_READ_MS` como ajuste do usuário (o ritmo de leitura varia bastante entre
closers) — mas isso é escopo posterior.

---

## Resumo dos arquivos envolvidos

| Arquivo | Papel |
|---|---|
| `src/features/listen/stt/sttService.js` | debounce, fechamento de turno, sinais de atividade |
| `src/features/listen/summary/summaryService.js` | cooldown, holds, serialização, prompt anti-repetição |
| `src/features/common/ai/providers/deepgram.js` | querystring do STT e filtro de mensagens |
| `src/features/listen/listenService.js` | liga STT → summary |
| `src/ui/listen/summary/SummaryView.js` | streaming, congelamento, histórico |
