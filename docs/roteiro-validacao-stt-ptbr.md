# Roteiro de Validação — STT em PT-BR (Tarefa 1.5)

**Objetivo:** decidir com evidência se a transcrição nativa (OpenAI `gpt-4o-mini-transcribe`) é boa o suficiente em português, ou se acionamos a aprovação do Deepgram (~US$ 0,50–0,92/h).

**Quem participa:** 1 pessoa como "closer" (Mac com o app) + 1 pessoa como "lead" (entra no Meet por outro dispositivo/navegador). Pode ser você + alguém do time, ~20 minutos.

---

## 1. Preparação (5 min)

- [ ] Rodar o app: `npm start` na raiz do projeto.
- [ ] Na tela de setup, cadastrar a **API key da OpenAI** (provider OpenAI para STT).
- [ ] Conceder permissões de **microfone** e **gravação de tela** quando o macOS pedir (Ajustes → Privacidade e Segurança). Reiniciar o app após conceder.
- [ ] Abrir uma call do Google Meet entre as duas pessoas. O "closer" **não usa fone** num primeiro momento (para testar o cancelamento de eco) e usa fone no segundo bloco.
- [ ] Clicar em **Listen** no app e confirmar que a transcrição ao vivo aparece.

## 2. Bateria de teste (10 min)

Cada pessoa lê as frases do seu bloco em ritmo normal de conversa. Marcar na tabela do item 3 o que a transcrição mostrou.

### Bloco A — Lead (áudio do sistema, canal "Them")

1. "Bom dia! Antes de começar, queria entender quanto custa e qual o prazo de contrato de vocês."
2. "A gente já investiu em tráfego pago com outra agência e o ROI foi péssimo, sinceramente."
3. "Nosso faturamento está em torno de R$ 180 mil por mês, com ticket médio de R$ 2.350."
4. "Hoje uso RD Station no marketing e Pipedrive no comercial, com integração via webhook."
5. "Vocês trabalham com CAC, LTV e ROAS? Como medem isso no dashboard?"
6. "Tô meio na correria, dá pra gente fechar isso até sexta-feira, dia vinte e três?"

### Bloco B — Closer (microfone, canal "Me")

1. "Perfeito, deixa eu te explicar como funciona nossa assessoria de marketing e o processo de aceleração."
2. "A V4 Company tem mais de quatro mil clientes e a gente trabalha com metodologia de funil completo."
3. "O investimento inicial fica em doze mil e quinhentos reais mensais, com três meses de garantia."
4. "A gente integra com o teu CRM, seja HubSpot, Kommo ou Pipedrive, sem custo adicional."

### Bloco C — Estresse (qualquer um dos dois)

1. Falar duas frases **ao mesmo tempo** (sobreposição de vozes).
2. Uma frase com **interrupção no meio** ("Então o que eu ia dizer é que— ah, desculpa, pode continuar").
3. Uma frase em ritmo **rápido** com sotaque carregado da sua região.
4. Repetir a frase A3 (números) com o closer **usando fone** (sem eco possível).

## 3. O que medir

Para cada frase, anotar: ✅ correta / ⚠️ erro leve (não muda o sentido) / ❌ erro grave (muda sentido, número errado, frase perdida).

| Critério | Meta (GO) |
|---|---|
| Frases com sentido preservado (✅+⚠️) | ≥ 90% (14 de 16) |
| **Números e valores** (frases A3, B3, C4) | 100% corretos — errar valor de faturamento/preço numa call de vendas é inaceitável |
| Nomes de ferramentas/termos (RD Station, Pipedrive, ROAS, CAC, LTV) | ≥ 80% reconhecíveis |
| Atribuição de falante (Me vs Them) | Sem troca de canal; sem eco duplicado no teste sem fone |
| Latência percebida (fala → texto parcial na tela) | < 1,5s consistente |
| Estabilidade | Nenhuma queda de sessão STT em 20 min |

## 4. Decisão

- **GO (fica a STT nativa):** todas as metas atingidas → seguir Sprint 1 sem Deepgram; tarefa 2.5 sai do escopo.
- **NO-GO (aciona Deepgram):** qualquer meta de número/valores falhou, ou sentido preservado < 90% → repetir esta mesma bateria com o provider Deepgram (tenho a mudança pronta; precisa de key trial) e comparar lado a lado antes de aprovar o custo.
- **Empate técnico:** se a nativa falhar só em latência ou estabilidade (não em qualidade), investigar rede antes de trocar de provider.

## 5. Registro

Colar os resultados (tabela preenchida + prints da transcrição) num comentário do commit ou em `docs/qa/validacao-stt-ptbr-resultado.md`. A decisão GO/NO-GO destrava a tarefa 1.7 (redesenho do trigger) com o provider definitivo.
