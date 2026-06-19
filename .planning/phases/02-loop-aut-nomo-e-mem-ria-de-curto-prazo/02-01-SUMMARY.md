---
phase: 02-loop-aut-nomo-e-mem-ria-de-curto-prazo
plan: 01
subsystem: cognition
tags: [langgraph, memory, ring-buffer, control-mode, chat-parser, typescript, bun]

# Dependency graph
requires:
  - phase: 01-presenca-e-conexao
    provides: WorldSnapshot (src/perception/types.ts), BotReadyCallback (src/bot/connection.ts)
provides:
  - Contratos cognitivos compartilhados (CognitiveState, ControlMode, MemEvent)
  - Memória de curto prazo: ring buffer com evicção FIFO por orçamento de tokens (MEM-01)
  - Máquina de modo de controle + parser literal de chat sem LLM (D-08/D-09)
  - "@langchain/langgraph 1.4.4 + @langchain/core 1.2.0 instalados (Bun-safe)"
affects: [02-02 (grafo cognitivo LangGraph), 02-03, 02-04, fase-03 (estado durável fora-do-bot)]

# Tech tracking
tech-stack:
  added: ["@langchain/langgraph@1.4.4", "@langchain/core@1.2.0"]
  patterns:
    - "API imutável: push retorna nova ShortTermMemory, não muta a entrada"
    - "Parser literal seguro: lookup exato via hasOwnProperty em mapa Object.freeze (sem eval/Function)"
    - "ControlState como closure fora do bot (lido pelo nó decide do grafo no Plano 02)"
    - "estimateTokens como esqueleto pluggable (Fase 3 troca heurística ~4ch/token por tokenizer real)"

key-files:
  created:
    - src/cognition/types.ts
    - src/memory/shortTerm.ts
    - src/memory/shortTerm.test.ts
    - src/control/commands.ts
    - src/control/commands.test.ts
  modified:
    - package.json

key-decisions:
  - "Usar langgraph 1.4.4 / core 1.2.0 (não 0.4.x da STACK/CLAUDE.md) — versões verificadas Bun-safe no RESEARCH (Pitfall 2)"
  - "DEFAULT_TOKEN_BUDGET = 2000 tokens (D-13, Claude's discretion)"
  - "Keywords de chat: !pausar->paused, !vem/!aqui->standby, !livre->autonomous (D-09)"

patterns-established:
  - "Ring buffer rico imutável com evicção FIFO por orçamento de tokens estimado"
  - "Parser de comando literal sem superfície de injeção (mitiga T-02-01/T-02-04)"

requirements-completed: [MEM-01]

# Metrics
duration: 9min
completed: 2026-06-19
---

# Phase 2 Plan 01: Fundação Sem-LLM (Tipos, Memória CP, Controle) Summary

**Ring buffer de memória de curto prazo com evicção FIFO por orçamento de tokens, parser literal de chat para modo de controle (sem LLM) e contratos cognitivos compartilhados, com langgraph 1.4.4 instalado para o grafo do Plano 02.**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-06-19
- **Completed:** 2026-06-19
- **Tasks:** 3
- **Files modified:** 6 (5 criados, 1 modificado)

## Accomplishments
- Contratos compartilhados (`CognitiveState`, `ControlMode`, `MemEvent`) exportados para os Planos 02/03 — tipos puros, sem dependência de mineflayer.
- Memória de curto prazo (MEM-01): ring buffer imutável com `estimateTokens` (~4 chars/token) e evicção FIFO ao estourar o orçamento (`DEFAULT_TOKEN_BUDGET = 2000`).
- Freio de segurança de controle (D-08/D-09): `parseCommand` literal seguro, `createControlState` (estado fora do bot) e `registerChatCommands` (um handler por sessão, ignora o próprio bot).
- `@langchain/langgraph@1.4.4` + `@langchain/core@1.2.0` instalados (versões Bun-safe verificadas no RESEARCH).

## Task Commits

Each task was committed atomically (tarefas TDD com test→feat):

1. **Task 1: langgraph 1.x + contratos de tipos** - `0670cb5` (feat)
2. **Task 2: ring buffer de memória CP (TDD)** - `792d84a` (test RED) → `6930994` (feat GREEN)
3. **Task 3: modo de controle + parser de chat (TDD)** - `155acb9` (test RED) → `fa42faa` (feat GREEN)

_Note: nenhum refactor foi necessário — o código GREEN já estava limpo nos dois ciclos TDD._

## Files Created/Modified
- `src/cognition/types.ts` - Contratos cognitivos compartilhados (CognitiveState, ControlMode, MemEvent discriminado por `type`).
- `src/memory/shortTerm.ts` - Ring buffer com orçamento de tokens: createMemory/push/getEvents/totalTokens/estimateTokens.
- `src/memory/shortTerm.test.ts` - 8 testes: push, evicção FIFO, ordem cronológica, imutabilidade, limite de orçamento.
- `src/control/commands.ts` - parseCommand literal seguro, createControlState, registerChatCommands.
- `src/control/commands.test.ts` - 7 testes: keywords, normalização, no-op, segurança contra props herdadas, máquina de modo.
- `package.json` - Adiciona @langchain/langgraph e @langchain/core.

## Decisions Made
- **langgraph 1.4.4 / core 1.2.0** em vez do "0.4.x" da CLAUDE.md/STACK.md — versões verificadas por runtime-test sob Bun no RESEARCH (Pitfall 2). A documentação de stack está desatualizada; seguimos o RESEARCH.
- **DEFAULT_TOKEN_BUDGET = 2000 tokens** (D-13, discrição) como padrão da memória de curto prazo.
- **Keywords literais** (D-09): `!pausar`→paused, `!vem`/`!aqui`→standby, `!livre`→autonomous.

## Deviations from Plan

None - plan executed exactly as written. Todos os blocos de código foram aplicados conforme especificado; os testes TDD passaram sem necessidade de refactor.

## Issues Encountered
- A primeira `bun add` executou no checkout compartilhado (`/root/MineMind`) por causa do diretório de trabalho do shell; reexecutada no worktree isolado para registrar deps no `package.json`/`bun.lock` corretos. Sem impacto no resultado.

## Threat Surface
Mitigações do threat model aplicadas conforme planejado:
- **T-02-01 (Tampering)**: `parseCommand` usa lookup literal via `Object.prototype.hasOwnProperty` em mapa `Object.freeze` — sem eval/Function/interpolação. Confirmado por `grep` (vazio) e teste contra props herdadas (`toString`/`constructor`/`__proto__` → null).
- **T-02-04 (Tampering)**: `registerChatCommands` ignora `username === bot.username`.

Nenhuma superfície de segurança nova fora do threat model.

## User Setup Required
None - no external service configuration required. (langgraph/core são deps locais; LM Studio só entra na Fase 3.)

## Next Phase Readiness
- Contratos, memória de curto prazo e máquina de controle prontos para o Plano 02 (grafo cognitivo LangGraph) fiar.
- `ControlState` e `ShortTermMemory` são estado fora-do-bot — alinhados ao requisito de estado durável da Fase 3.
- Sem blockers.

## Self-Check: PASSED

- FOUND: src/cognition/types.ts
- FOUND: src/memory/shortTerm.ts
- FOUND: src/memory/shortTerm.test.ts
- FOUND: src/control/commands.ts
- FOUND: src/control/commands.test.ts
- FOUND commit: 0670cb5, 792d84a, 6930994, 155acb9, fa42faa
- typecheck: exit 0 | tests: 15/15 pass

---
*Phase: 02-loop-aut-nomo-e-mem-ria-de-curto-prazo*
*Completed: 2026-06-19*
