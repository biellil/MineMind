---
phase: 02-loop-aut-nomo-e-mem-ria-de-curto-prazo
plan: 02
subsystem: cognition
tags: [arbiter, priority-arbitration, gathering-ladder, anti-repeat, backoff, safety, pure-functions, typescript, bun]

# Dependency graph
requires:
  - phase: 01-presenca-e-conexao
    provides: WorldSnapshot (src/perception/types.ts), SkillTimeoutError/SkillStuckError (src/skills/executor.ts)
  - phase: 02-loop-aut-nomo-e-mem-ria-de-curto-prazo
    plan: 01
    provides: CognitiveState, ControlMode (src/cognition/types.ts)
provides:
  - "Arbitragem por prioridade fixa Socializing>Gathering>Exploring>Idle (D-05, COG-02)"
  - "Escada de Gathering de sobrevivência configurável (D-07)"
  - "Rede anti-repetição + backoff de falha de skill como máquina pura (D-10/D-11, COG-04)"
  - "Config do loop estendida: minTickMs, gatheringLadder, antiRepeatN, backoffM, targetCooldownMs, socialRadius, memoryTokenBudget"
  - "PRIORITY_ORDER / STUB_STATES (estados stub Fighting/Building declarados — D-06)"
affects: [02-03 (grafo cognitivo LangGraph + driver), 02-04, fase-03 (estado durável)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Funções puras de regra fixa sobre WorldSnapshot read-only — sem bot, sem LLM, sem efeito colateral"
    - "Máquina de segurança pura com tempo injetado (`now` como parâmetro) para testes determinísticos"
    - "Cooldown de alvos feeds excludeTargets de arbitrate — composição entre safety e arbiter"
    - "Config centralizada do loop com override por env var + validação de sanidade em startup"

key-files:
  created:
    - src/cognition/states.ts
    - src/cognition/arbiter.ts
    - src/cognition/arbiter.test.ts
    - src/cognition/safety.ts
    - src/cognition/safety.test.ts
  modified:
    - src/config.ts

key-decisions:
  - "Escada de Gathering (Claude's discretion): madeira > pedra > minérios básicos > minérios valiosos — sobrevivência primeiro (ferramentas)"
  - "N=3 (antiRepeat), M=3 (backoff), targetCooldownMs=15000, socialRadius=8, minTickMs=500 (Claude's discretion, override por env)"
  - "isSkillFailure trata qualquer Error como falha do backoff; names conhecidos do executor documentam origem"

patterns-established:
  - "Camada de decisão sem-LLM como funções puras testáveis isoladamente, prontas para o grafo fiar"
  - "Separação safety (estado mutável com `now` injetado) vs arbiter (puro stateless) — composição via excludeTargets"

requirements-completed: [COG-02, COG-04]

# Metrics
duration: 3min
completed: 2026-06-19
---

# Phase 2 Plan 02: Lógica de Decisão Sem-LLM (Arbitragem, Escada, Segurança) Summary

**Núcleo de decisão sem-LLM do loop cognitivo: arbitragem por prioridade fixa (Socializing>Gathering>Exploring>Idle) com sobreposição de modo de controle, escada de Gathering de sobrevivência configurável, e rede anti-repetição + backoff de falha de skill — tudo como funções/máquinas puras sobre o WorldSnapshot, prontas para o Plano 03 fiar no StateGraph.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-06-19
- **Completed:** 2026-06-19
- **Tasks:** 3
- **Files modified:** 6 (5 criados, 1 modificado)

## Accomplishments
- **Config do loop centralizada** (Task 1): `src/config.ts` estendido com `minTickMs`, `gatheringLadder`, `antiRepeatN`, `backoffM`, `targetCooldownMs`, `socialRadius`, `memoryTokenBudget` — todos com override por env var e validação de sanidade. Campos da Fase 1 preservados.
- **Estados e prioridade** (Task 1): `src/cognition/states.ts` declara `PRIORITY_ORDER` (D-05) e `STUB_STATES` (Fighting/Building — D-06) com helper `isStub`.
- **Arbitragem (COG-02 / D-05 / D-07)** (Task 2): `arbitrate` aplica prioridade fixa com sobreposição de modo (paused→idle, standby→socializing); `highestPriorityGatherTarget` percorre a escada cruzando com `nearbyBlockTypes` e respeita cooldown; `hasNearbyPlayer` dispara Socializing por `socialRadius`. Tudo puro sobre o snapshot read-only.
- **Segurança (COG-04 / D-10 / D-11)** (Task 3): máquina pura `SafetyState` com `now` injetado — `recordAttempt`/`shouldAbandon` (abandona após N repetições), `recordFailure`/`shouldFallbackToIdle` (cooldown + cai para Idle após M falhas), `cooledDownTargets` (feeds `excludeTargets` de `arbitrate`), `isSkillFailure` (classifica erros do executor).

## Task Commits

Tarefas 2 e 3 em TDD (test RED → feat GREEN); nenhum refactor necessário (GREEN já limpo):

1. **Task 1: config do loop + states.ts** — `5315f28` (feat)
2. **Task 2: arbitragem + escada (TDD)** — `378d685` (test RED) → `ed4a966` (feat GREEN)
3. **Task 3: anti-repetição + backoff (TDD)** — `dc37ace` (test RED) → `3c1a05b` (feat GREEN)

## Files Created/Modified
- `src/config.ts` — estendido com 7 parâmetros do loop (D-02/D-05/D-07/D-10/D-11/D-13) + validações; campos da Fase 1 intactos.
- `src/cognition/states.ts` — `PRIORITY_ORDER`, `STUB_STATES`, `isStub` (COG-02/D-05/D-06).
- `src/cognition/arbiter.ts` — `arbitrate`, `highestPriorityGatherTarget`, `hasNearbyPlayer` (funções puras).
- `src/cognition/arbiter.test.ts` — 14 testes: modos de controle, jogador próximo, escada de prioridade, cooldown.
- `src/cognition/safety.ts` — máquina `SafetyState` pura + 8 funções de anti-repetição/backoff/cooldown.
- `src/cognition/safety.test.ts` — 13 testes: repetição→abandono, falhas→Idle, cooldown determinístico via `now`, classificação de erro.

## Decisions Made
- **Escada de Gathering** (D-07, discrição): madeira (ferramentas) > pedra > minérios básicos (carvão/ferro/cobre) > minérios valiosos (diamante/ouro). Prioriza sobrevivência. Configurável; o alvo escolhido é o de maior prioridade *presente* no snapshot.
- **N=3 / M=3 / cooldown=15s / socialRadius=8 / minTickMs=500** (discrição) — todos com override por env var.
- **`isSkillFailure` aceita qualquer Error** como falha de backoff (timeout, stuck, "bloco não encontrado"); as checagens explícitas de `name` documentam as origens conhecidas do executor.

## Deviations from Plan

None - plan executed exactly as written. Os blocos de código foram aplicados conforme especificado. Único ajuste de detalhe no teste (não no contrato): `isSkillFailure` retorna `false` para valores não-`Error` (string/null), comportamento que o código do plano já garante via `err instanceof Error`; o teste cobre esse caso explicitamente. Os ciclos TDD passaram sem necessidade de refactor.

## Issues Encountered
- Worktree iniciou em base divergente (`e0f3cef` em vez de `ca1fb0f` — faltava o commit de roadmap/state do fim da Wave 1). Resetado para a base correta (`ca1fb0f`, descendente direto e clean) antes de executar. Sem impacto no código.

## Threat Surface
Mitigações do threat model aplicadas conforme planejado:
- **T-02-05 (Tampering)**: `arbitrate`/`highestPriorityGatherTarget` só leem o `WorldSnapshot` read-only e config estática — nenhuma escrita, bot, ou eval. Aceito sem superfície.
- **T-02-06 (DoS)**: `gatheringLadder` é lista finita e estática; loop O(escada) por tick, sem entrada de usuário controlando o tamanho.
- **T-02-07 (DoS)**: `cooldownUntil` Map só recebe tipos de bloco da escada (conjunto finito), não entrada arbitrária de jogador — Map limitado pelo tamanho da escada.

Nenhuma superfície de segurança nova fora do threat model.

## User Setup Required
None - nenhuma configuração de serviço externo. Os parâmetros do loop têm defaults sensatos; overrides opcionais via env (`MIN_TICK_MS`, `ANTI_REPEAT_N`, `BACKOFF_M`, `TARGET_COOLDOWN_MS`, `SOCIAL_RADIUS`, `MEMORY_TOKEN_BUDGET`).

## Next Phase Readiness
- `arbitrate` (stateless puro) + `SafetyState` (estado mutável com `now` injetado) prontos para o Plano 03 fiar no StateGraph LangGraph e no driver de tick.
- Composição já definida: `cooledDownTargets(safety, now)` → `excludeTargets` de `arbitrate`. O grafo só precisa orquestrar: snapshot → arbitrate → executa skill → record(Success|Failure).
- Estados stub (Fighting/Building) declarados mas sem lógica — o grafo deve roteá-los a no-op/Idle por enquanto.
- Sem blockers.

## Self-Check: PASSED

- FOUND: src/cognition/states.ts
- FOUND: src/cognition/arbiter.ts
- FOUND: src/cognition/arbiter.test.ts
- FOUND: src/cognition/safety.ts
- FOUND: src/cognition/safety.test.ts
- FOUND: src/config.ts (modificado)
- FOUND commits: 5315f28, 378d685, ed4a966, dc37ace, 3c1a05b
- typecheck: exit 0 | tests: 72/72 pass (suite completa, sem regressões)

---
*Phase: 02-loop-aut-nomo-e-mem-ria-de-curto-prazo*
*Completed: 2026-06-19*
