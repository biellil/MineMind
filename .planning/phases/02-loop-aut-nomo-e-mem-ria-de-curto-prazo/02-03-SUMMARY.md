---
phase: 02-loop-aut-nomo-e-mem-ria-de-curto-prazo
plan: 03
subsystem: cognition
tags: [langgraph, stategraph, cognitive-loop, single-flight-driver, memorysaver, wiring, typescript, bun]

# Dependency graph
requires:
  - phase: 01-presenca-e-conexao
    provides: WorldSnapshot/buildWorldSnapshot (src/perception), skillRegistry/executeWithSafety (src/skills), BotReadyCallback (src/bot/connection.ts)
  - phase: 02-loop-aut-nomo-e-mem-ria-de-curto-prazo
    plan: 01
    provides: CognitiveState/MemEvent (types), createMemory/push (memory), createControlState/registerChatCommands (control)
  - phase: 02-loop-aut-nomo-e-mem-ria-de-curto-prazo
    plan: 02
    provides: arbitrate/highestPriorityGatherTarget (arbiter), createSafetyState + anti-repeat/backoff/cooldown (safety), config do loop
provides:
  - "Loop cognitivo completo: StateGraph finito-por-tick + driver externo single-flight (COG-01)"
  - "Nós observe/analyze/updateMemory/decide/execute com bot/control/safety por closure (Pitfall 3)"
  - "MemorySaver + thread_id persistindo estado entre ticks (D-03)"
  - "onBotReady fiado ao loop com stop-on-disconnect (sem driver órfão na reconexão)"
affects: [02-04 (smoke test live do loop), fase-03 (LLM no nó decide + estado durável)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Driver externo single-flight: while + graph.invoke({}, {thread_id}) por tick — NÃO self-loop interno (evita GraphRecursionError aos 25 — Pitfall 1)"
    - "bot/control/safety injetados por closure via createNodes(deps) — NUNCA no estado anotado (Pitfall 3)"
    - "Grafo finito por tick terminando em END; a aresta de retorno é o driver externo (D-01)"
    - "stop-on-disconnect: bot.once('end') seta alive=false — o while da sessão morta termina"

key-files:
  created:
    - src/cognition/nodes.ts
    - src/cognition/graph.ts
    - src/cognition/loop.ts
  modified:
    - src/bot/index.ts

key-decisions:
  - "Consolidar a transição/execução no nó execute (analyze já resolveu cogState); updateMemory/decide ficam nominais para fidelidade ao ciclo nomeado D-01"
  - "exploring usa navigate até ponto deslocado (vaguear visível); socializing usa navigate até o jogador mais próximo (não o stub follow)"
  - "thread_id fixo 'minemind-agent' — único agente; estado acumula entre ticks via MemorySaver"

patterns-established:
  - "Loop cognitivo always-on como grafo finito + driver externo (padrão idiomático LangGraph JS para evitar recursionLimit)"
  - "Injeção de dependências vivas (bot/control/safety) por closure, mantendo o estado anotado puro e serializável pelo MemorySaver"

requirements-completed: [COG-01, COG-02, COG-04, MEM-01]

# Metrics
duration: 7min
completed: 2026-06-19
---

# Phase 2 Plan 03: Montagem do Loop Cognitivo (Grafo + Driver) Summary

**Loop cognitivo completo fiado de ponta a ponta: StateGraph finito-por-tick (Observe→Analyze→UpdateMemory→Decide→Execute→END) com MemorySaver, mais um driver externo single-flight (while + graph.invoke por tick) que satisfaz a aresta de retorno da D-01 sem estourar o recursionLimit do LangGraph (Pitfall 1), substituindo a demo da Fase 1 em onBotReady por startCognitiveLoop com parada na desconexão.**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-06-19
- **Completed:** 2026-06-19
- **Tasks:** 3
- **Files modified:** 4 (3 criados, 1 modificado)

## Accomplishments
- **Nós do grafo** (Task 1, `src/cognition/nodes.ts`): `createNodes(deps)` com `bot`/`control`/`safety` por closure (Pitfall 3 — nunca no estado anotado). `observe` captura o `WorldSnapshot` imutável; `analyze` arbitra por prioridade fixa (D-05) excluindo alvos em cooldown e cai para Idle no backoff (D-11); `execute` dispara NO MÁXIMO uma skill por tick via `executeWithSafety` (D-02 single-flight), registra anti-repetição/backoff e grava o evento na memória de curto prazo (D-12). `updateMemory`/`decide` nominais para fidelidade ao ciclo nomeado (D-01).
- **StateGraph** (Task 2, `src/cognition/graph.ts`): `Annotation.Root` carrega só dados puros (`snapshot`/`cogState`/`memory`); grafo FINITO por tick terminando em `END` (sem self-loop — Pitfall 1); `MemorySaver` como checkpointer (JS puro, Bun-safe). `buildGraph(deps)` injeta as dependências vivas por closure.
- **Driver externo** (Task 3, `src/cognition/loop.ts`): `startCognitiveLoop(bot)` roda um `while (alive)` que re-invoca o grafo por tick com `thread_id` fixo (a aresta de retorno da D-01), respeitando `config.minTickMs` entre ticks (D-02). Para automaticamente na desconexão via `bot.once('end')` (stop-on-disconnect) — a reconexão inicia um loop fresco sem deixar o antigo órfão. Registra o parser de chat por sessão (D-09).
- **Wiring** (Task 3, `src/bot/index.ts`): `onBotReady` substitui a demo de snapshot/skills da Fase 1 por `startCognitiveLoop(bot)`. `connection.ts` ficou inalterado (o fluxo de reconexão da Fase 1 já chama `onReady` por sessão).

## Task Commits

Cada tarefa committada atomicamente:

1. **Task 1: nós do grafo** — `efe123d` (feat)
2. **Task 2: StateGraph + MemorySaver** — `3a37c46` (feat)
3. **Task 3: driver externo + wiring** — `a12689d` (feat)

## Files Created/Modified
- `src/cognition/nodes.ts` — `createNodes(deps)`, `LoopState`, `NodeDeps`; nós observe/analyze/updateMemory/decide/execute. bot por closure; 1 skill por tick via executeWithSafety.
- `src/cognition/graph.ts` — `Annotation.Root` (snapshot/cogState/memory), `buildGraph(deps)`, ciclo finito até END, MemorySaver checkpointer.
- `src/cognition/loop.ts` — `startCognitiveLoop(bot)`: driver single-flight, thread_id, minTickMs, stop-on-disconnect, parser de chat por sessão.
- `src/bot/index.ts` — onBotReady chama `startCognitiveLoop(bot)`; removida a demo de snapshot/skills da Fase 1.

## Decisions Made
- **Transição/execução consolidadas no nó `execute`**: como `analyze` já resolve `cogState`, `updateMemory`/`decide` ficam como no-op nominais — mantidos no grafo apenas para fidelidade ao ciclo nomeado da D-01, sem duplicar lógica.
- **`exploring` → navigate até ponto deslocado** (vaguear visível, sem alvo de bloco); **`socializing` → navigate até o jogador mais próximo** (usa `navigate`, não o stub `follow`).
- **`thread_id` fixo `'minemind-agent'`** — único agente; `MemorySaver` + `thread_id` acumulam o estado entre ticks com `graph.invoke({})` de input vazio (verificado no RESEARCH).

## Deviations from Plan

None - plan executed exactly as written. Os blocos de código do plano foram aplicados conforme especificado (única diferença cosmética: importação consolidada de `createControlState`/`registerChatCommands` numa só linha em loop.ts, sem efeito de contrato). Typecheck exit 0 e suíte completa 72/72 sem regressões.

## Issues Encountered
- O worktree iniciou numa base divergente (`e0f3cef`) cujo working tree não continha os outputs das Waves 1/2 (`arbiter.ts`/`safety.ts`/`states.ts`/`config.ts` estendido). Após `git reset --soft 73d5c9b` (base correta), restaurei o working tree dos arquivos-fonte a partir de HEAD para trazer de volta os outputs das ondas anteriores antes de executar. Sem impacto no código entregue.

## Threat Surface
Mitigações do threat model aplicadas conforme planejado:
- **T-02-08 (DoS — loop driver)**: single-flight + `minTickMs` garantem no máximo 1 skill por tick com intervalo; `executeWithSafety` impõe timeout/watchdog da Fase 1 — um tick nunca trava o loop.
- **T-02-09 (Tampering — graph state/MemorySaver)**: o `bot` NUNCA entra no estado anotado (só closure); `LoopState` carrega apenas `WorldSnapshot` (deep-frozen) e dados puros — MemorySaver não serializa referências vivas. Confirmado: `LoopState` não tem campo `Bot`.
- **T-02-10 (DoS — driver órfão)**: `bot.once('end')` seta `alive=false`; o `while` da sessão morta termina, evitando dois drivers concorrentes após reconexão.
- **T-02-11 (EoP — comando de chat pausa o agente)**: aceito por design (freio cooperativo, servidor local offline-mode, sem auth na v1) — idêntico a T-02-02 do Plano 01.

Nenhuma superfície de segurança nova fora do threat model.

## User Setup Required
None - nenhuma configuração de serviço externo. O loop roda contra o servidor MC já configurado na Fase 1; LM Studio só entra na Fase 3.

## Next Phase Readiness
- Loop cognitivo completo e fiado: o grafo roda por tick, alterna estados por arbitragem e executa skills com segurança. Pronto para o smoke test live (Plano 04).
- Ponto de extensão da Fase 3: o nó `decide` (hoje nominal) e/ou `analyze` recebem o LLM; o `MemorySaver` em memória dá lugar a estado durável (Fase 4). A injeção por closure e o estado anotado puro já estão preparados para isso.
- Sem blockers.

## Self-Check: PASSED

- FOUND: src/cognition/nodes.ts
- FOUND: src/cognition/graph.ts
- FOUND: src/cognition/loop.ts
- FOUND: src/bot/index.ts (modificado — onBotReady chama startCognitiveLoop)
- FOUND commits: efe123d, 3a37c46, a12689d
- typecheck: exit 0 | tests: 72/72 pass (suíte completa, sem regressões)
- sem self-loop: `! grep "addEdge('execute', 'observe')"` confirmado | setInterval em nodes.ts = 0

---
*Phase: 02-loop-aut-nomo-e-mem-ria-de-curto-prazo*
*Completed: 2026-06-19*
