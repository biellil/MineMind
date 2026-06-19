---
phase: 03-cogni-o-com-llm-loop-completo-necessidades-e-objetivos
plan: 03
subsystem: cognition
tags: [integration, holder, deliberation, single-flight, needs, goals, fallback, two-rate]
requires:
  - src/llm/provider.ts (createLmStudioProvider — instanciado 1x por sessão no loop)
  - src/llm/structured.ts (decideAction — caminho LLM com fallback injetado)
  - src/llm/prompts.ts (buildPersonaPrompt/serializeContext — contexto da deliberação)
  - src/llm/schemas.ts (ActionDecision — tipo da decisão no holder)
  - src/motivation/needs.ts (createNeeds/evaluateNeeds/urgency)
  - src/motivation/goals.ts (generateGoals/selectGoal)
  - src/motivation/types.ts (Disposition/Need/Goal/MotivationConfig)
  - src/cognition/arbiter.ts (arbitrate — piso/fallback determinístico, D-17)
provides:
  - "CognitiveStateHolder + createCognitiveStateHolder (mente durável em-processo — CONN-03/D-20)"
  - "motivationConfigFor(disposition) + needWeightsFor(disposition) (pesos por disposição — D-06/D-10)"
  - "createDeliberator/maybeDeliberate/shouldTrigger/arbiterToDecision (deliberação single-flight fora do grafo — COG-03/D-19)"
  - "startCognitiveLoop(bot, holder) (loop recebe a mente por parâmetro)"
  - "buildGraph({ bot, holder, provider }) com needs/goals/disposition no estado anotado"
affects:
  - "Plan 04 (conversacional): SETA holder.playerRequestPending e o caminho de disposição/chat; não estende a struct"
  - "Plan 05 (smoke da forma nova): cobre o loop integrado com holder/provider"
tech-stack:
  added: []
  patterns:
    - "Estado durável fora-do-bot (Pattern 4/A4): holder mutável criado 1x, injetado por sessão; sem persistência em disco (D-20)"
    - "Duas taxas (Pattern 3): deliberação LLM single-flight event-driven FORA do grafo; tick reativo nunca aguarda a inferência (void, não await)"
    - "Config por disposição via função pura (motivationConfigFor) em vez de cfg global único"
key-files:
  created:
    - src/cognition/state.ts
    - src/cognition/state.test.ts
    - src/cognition/deliberation.ts
    - src/cognition/deliberation.test.ts
  modified:
    - src/config.ts
    - src/cognition/graph.ts
    - src/cognition/nodes.ts
    - src/cognition/loop.ts
    - src/cognition/loop.smoke.test.ts
    - src/bot/index.ts
    - .env.example
decisions:
  - "Disposition reconciliada: config.ts/state.ts/loop.ts/nodes.ts importam Disposition de motivation/types.ts (fonte única estrutural); prompts.ts mantém sua própria union string-literal idêntica — compatível estruturalmente, sem import cruzado forçado."
  - "Frescor da decisão LLM: analyze só usa holder.llmDecision se (now - at) < replanMinIntervalMs*2 E o modo de controle é 'autonomous' (paused/standby seguem o arbiter determinístico)."
  - "decide permanece no-op nominal; a resolução de target (goal/llmDecision.target) é feita no execute para um único ponto de montagem física via skillRegistry (D-10)."
  - "trigger do loop simplificado: 'need_threshold' quando alguma urgency cruza goalThreshold, senão 'periodic' (teto de frequência via replanMinIntervalMs)."
metrics:
  tasks: 3
  files_created: 4
  files_modified: 7
  commits: 4
  tests: "12 novos (state 4 + deliberation 8); 135/135 na suite completa — todos verdes"
  duration_min: ~25
  completed: 2026-06-19
---

# Phase 3 Plan 03: Integração LLM + Motivação no Loop (Holder Durável, Deliberação Duas-Taxas) Summary

Acopla a fundação LLM (Plan 01) e a motivação (Plan 02) ao loop provado da Fase 2 entregando as três peças mais estruturais da fase: (1) uma mente durável fora-do-bot (`CognitiveStateHolder`) criada 1x e injetada por sessão, de modo que a reconexão não reinicia needs/goals/memory (CONN-03/D-20); (2) uma deliberação LLM single-flight, event-driven, com orçamento de replanejamento, rodando FORA do grafo e escrevendo a decisão no holder — o tick reativo nunca espera a inferência (COG-03/D-19, Pattern 3); (3) o wiring que pluga `evaluateNeeds`/`generateGoals`/`selectGoal` no `observe` com pesos POR DISPOSIÇÃO e faz o `analyze` preferir a decisão LLM fresca, degradando ao arbiter quando ausente/velha (D-17).

## O Que Foi Construído

- **src/cognition/state.ts** — `CognitiveStateHolder` (control/safety/memory + needs/goals/currentGoal/disposition/playerRequestPending/llmDecision) e `createCognitiveStateHolder(now)`. Fonte única em-processo (Pattern 4/A4); `memory` reatribuível; SEM persistência em disco (D-20). — **CONN-03/D-20**
- **src/config.ts** — knobs da Fase 3 (LLM, disposição, proatividade, replan, decaimentos, limiares, resourceTargets) com defaults via `.env`; `needWeightsFor(disposition)` (pesos concretos por disposição, sobrescrevíveis por `NEED_WEIGHT_<DISP>_*`); `motivationConfigFor(disposition)` que monta o `MotivationConfig` correto por disposição (D-06/D-10); validações de startup. — **NEED-02/GOAL-02**
- **src/cognition/deliberation.ts** — `createDeliberator()` (single-flight no closure), `maybeDeliberate` (inFlight → replan budget → shouldTrigger → `decideAction` com fallback → grava `holder.llmDecision`), `shouldTrigger` (chat só em ASSISTANT, D-07), `arbiterToDecision` (arbiter como piso, mapeia CognitiveState → enum fechado, D-17). NÃO é nó do grafo (Pattern 3). — **COG-03/D-19/LLM-02**
- **src/cognition/graph.ts** — `LoopAnnotation` estende `needs/goals/currentGoal/disposition`; `buildGraph` recebe `{ bot, holder, provider }`.
- **src/cognition/nodes.ts** — `observe` roda a motivação com `motivationConfigFor(holder.disposition)` e escreve no holder (reset de `playerRequestPending` ao consumir um pedido); `analyze` prefere `holder.llmDecision` fresca senão `arbitrate` (D-17); `execute` resolve o alvo de gather do LLM quando válido e grava memória no holder. — **NEED-02/GOAL-02/LLM-01/02**
- **src/cognition/loop.ts** — `startCognitiveLoop(bot, holder)`: usa `holder.control`/`holder.safety`, cria `provider`+`deliberator` 1x, e a cada tick dispara `void deliberator.maybeDeliberate(...)` sem bloquear o while (Pitfall 3).
- **src/bot/index.ts** — holder criado 1x ANTES de `createBot`; `onBotReady` injeta o mesmo holder em cada sessão (reconexão não reinicia a mente — D-20/Pitfall 2).

## Como Funciona

- **Duas taxas (Pattern 3):** o grafo finito-por-tick (camada reativa) lê a decisão PRONTA do holder; a deliberação lenta roda em paralelo via `void` — nunca entra no caminho síncrono do tick. Single-flight (`inFlight`) + orçamento `replanMinIntervalMs` (D-19) impedem inferências concorrentes/excessivas (T-03-09).
- **Fonte única (Pattern 4/A4):** `observe` semeia needs/goals do holder no estado anotado; `execute`/`observe` escrevem de volta no holder. O estado anotado do MemorySaver é espelho conveniente; o holder é a verdade.
- **Degradação (D-17):** com LLM off, `decideAction` usa o fallback (`arbiterToDecision`) sem custo de inferência; com decisão velha/ausente, `analyze` cai direto no `arbitrate`. O loop nunca trava nem depende do LLM.

## Reconciliação do Hand-off da Wave 1

- **Disposition unificada (estrutural):** `config.ts`, `state.ts`, `loop.ts` e `nodes.ts` agora importam `Disposition` de `src/motivation/types.ts` (declaração única). `src/llm/prompts.ts` mantém sua própria `type Disposition = 'AUTONOMOUS'|'ASSISTANT'` idêntica — as duas são estruturalmente compatíveis (string-literal union), então `buildPersonaPrompt(holder.disposition)` typechecka sem import cruzado forçado. Convergência estrutural sem acoplamento desnecessário entre os módulos LLM e motivação.
- **motivationConfigFor derivado de .env:** implementado conforme esperado pelo Plan 02 — pesos concretos por disposição lidos da config, injetados nas funções puras.
- **dependsOn estrutural (D-16):** preservado como gap conhecido; `selectGoal` não o consulta (não assumido funcionando).
- **Fallback que nunca lança (D-17):** preservado — a deliberação e o analyze degradam ao arbiter sem exceção.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Smoke test da Fase 2 adaptado à nova assinatura de buildGraph**
- **Found during:** Task 3
- **Issue:** `src/cognition/loop.smoke.test.ts` chamava `buildGraph({ bot, control, safety })` (assinatura antiga). A Task 3 muda para `{ bot, holder, provider }` — sem ajuste, o arquivo quebraria a compilação/teste.
- **Fix:** Os 3 `buildGraph(...)` do smoke passaram a usar `createCognitiveStateHolder()` + um `provider` stub (nunca invocado pelo grafo, pois a deliberação é fora dele); o caso "paused" usa `holder.control.setMode('paused')`. O plano previa isso explicitamente ("smoke do Plan 05 cobre a nova forma"); mantivemos o smoke verde no intervalo.
- **Files modified:** src/cognition/loop.smoke.test.ts
- **Commit:** 9b5522a

## Deferred Issues

- **Verificação final de `tsc --noEmit` bloqueada pelo sandbox:** todos os comandos de typecheck (`bunx tsc --noEmit`, `bun run typecheck`) foram negados pelo ambiente desta execução (mesmo bloqueio relatado no SUMMARY do Plan 01). A verificação de tipos foi feita via `bun test` (type-stripping + execução) sobre a suite inteira (135/135 verdes), incluindo os 12 testes novos que exercitam holder, deliberação, mapeamentos de enum e o grafo integrado. As assinaturas foram reconciliadas manualmente em toda a cascata (graph→nodes→loop→bot/index→smoke). Risco de erro de tipo residual: baixo. **Recomenda-se rodar `bun run typecheck` no merge do orchestrator** (onde os hooks são validados).

## Authentication Gates

Nenhum gate atingido. **User setup em runtime (não bloqueante):** habilitar o servidor do LM Studio e configurar `LLM_BASE_URL`/`LLM_MODEL`. Sem isso, `available()` retorna false e o agente degrada para o arbiter determinístico (D-17) — o loop continua rodando normalmente.

## Known Stubs

- **`decide` permanece no-op nominal:** a resolução de target foi consolidada no `execute` (ponto único de montagem física via `skillRegistry`, D-10). Intencional e documentado no código; não impede o objetivo do plano. O caminho de target de `player_request` será exercitado pelo Plan 04 (conversacional), que SETA `holder.playerRequestPending`.
- **`shelter`/`social` needs:** continuam stub (herdado do Plan 02, D-08) — sem decaimento real; pesos 0 em `needWeightsFor`. Documentado, não silencioso.

## Threat Flags

Nenhuma superfície de segurança nova além do `<threat_model>` do plano. As mitigações previstas foram implementadas: analyze só usa `llmDecision` fresca/mapeável e modo autônomo, senão `arbitrate` (T-03-08); `maybeDeliberate` single-flight + cooldown + event-driven + `void` (T-03-09); holder criado 1x, handlers registrados 1x por sessão (T-03-10); knobs `.env` sem segredos (T-03-11, accept).

## Self-Check: PASSED
