---
phase: 07-grounding-skillresult
plan: 01
subsystem: grounding
tags: [skillresult, grounding, immutable-snapshot, pure-functions, tdd, mineflayer]

# Dependency graph
requires:
  - phase: 02-perception
    provides: Position3D/InventorySlot + padrão Object.freeze(structuredClone) de buildWorldSnapshot
  - phase: 01-skills
    provides: progressChecker numérico de dig/navigate a generalizar (DigParams.count, NavigateParams.range)
provides:
  - Tipo SkillResult tagueado por outcome (success|partial|no_effect|error) com observed/expected/delta
  - Tipo GroundState imutável (inventoryCount, itemsByName, position, targetBlockName)
  - captureGroundState(bot, targetPos?) — captura central congelada (D-04/D-05)
  - inventoryDelta(before, after) — delta por-item puro
  - evaluateDig / evaluateNavigate — predicados puros que decidem outcome por delta numérico (D-04/D-06)
affects: [07-02, 07-03, 07-04, gathering, navigate, executor, grounding]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Captura central imutável fora do executor (Object.freeze + structuredClone espelhado de snapshot.ts)"
    - "Julgamento de sucesso PURO por skill (GroundState in, SkillResult out, sem mock de bot)"
    - "outcome derivado de observed/expected — nunca da resolução da Promise (GRND-01)"

key-files:
  created:
    - src/grounding/types.ts
    - src/grounding/capture.ts
    - src/grounding/evaluate.ts
    - src/grounding/evaluate.test.ts
  modified: []

key-decisions:
  - "SkillResult é base FLAT tagueada por outcome; observed NÃO tipado por skill (D-02, deferido p/ Fases 11/13)"
  - "Captura (capture.ts) é independente do executor — não infla executeWithSafety (D-05)"
  - "gainedTotal soma só deltas positivos: perda de item nunca credita coleta (no_effect)"
  - "navigate distingue partial (moveu, não chegou) de no_effect (parado) — observed 0 em ambos, outcome diferente"

patterns-established:
  - "Módulo grounding/ é a base: ZERO import de src/skills/ (skills consomem grounding, não o contrário)"
  - "Evaluate puro testável sem bot: GroundState literais em vez de mocks"
  - "outcome = label derivado; observed = fonte de verdade numérica"

requirements-completed: [GRND-01]

# Metrics
duration: ~4min
completed: 2026-06-19
---

# Phase 7 Plan 1: Grounding + SkillResult (contrato) Summary

**Módulo `grounding/` que separa captura imutável do mundo (captureGroundState) do julgamento puro de sucesso por skill (evaluateDig/evaluateNavigate), tudo derivado do tipo SkillResult tagueado por outcome — a base que mata a alucinação "peguei 10 tábuas".**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-06-19T23:22:56Z
- **Completed:** 2026-06-19T23:30:00Z
- **Tasks:** 3
- **Files modified:** 4 (todos criados)

## Accomplishments
- Contrato `SkillResult`/`SkillOutcome`/`GroundState`/`InventoryDelta` exportado e compilando (reusa Position3D da perception)
- `captureGroundState(bot, targetPos?)` retorna GroundState congelado (Object.freeze + structuredClone), independente do executor (D-05)
- `evaluateDig`/`evaluateNavigate` puros classificam success/partial/no_effect por delta numérico — sem mock de bot
- Suite de 8 testes verde cobrindo os 3 ramos de cada predicado, incluindo o caso âncora "coletou 3 de 10 → observed:3, outcome:partial"

## Task Commits

Each task was committed atomically:

1. **Task 1: Definir SkillResult, SkillOutcome e GroundState** - `47f17f2` (feat)
2. **Task 2: captureGroundState + inventoryDelta** - `3508783` (feat)
3. **Task 3: evaluate puro por skill (TDD)** - `f22fcc6` (test/RED) → `08312e2` (feat/GREEN)

_TDD: Task 3 teve commit RED (teste falhando, módulo inexistente) seguido de GREEN (implementação minimal, suite verde). Refactor não necessário._

## Files Created/Modified
- `src/grounding/types.ts` - Contrato: SkillResult tagueado por outcome, GroundState imutável, InventoryDelta
- `src/grounding/capture.ts` - captureGroundState(bot, targetPos?) congelado + inventoryDelta(before, after) puro
- `src/grounding/evaluate.ts` - evaluateDig/evaluateNavigate puros (outcome por delta numérico)
- `src/grounding/evaluate.test.ts` - 8 testes (bun test), GroundState literais sem bot

## Decisions Made
- **observed NÃO tipado por skill (D-02):** SkillResult é shape base flat; union tipada de observed para as 4 skills fica deferida (Fases 11/13). Follow/attack ficam no shape base.
- **Captura independente do executor (D-05):** capture.ts não importa src/skills/executor.ts — captura é genérica, não infla executeWithSafety.
- **gainedTotal só credita ganhos:** perdas de item (ex.: comer maçã) retornam no_effect/observed:0 na coleta, não creditam falsamente.
- **navigate partial vs no_effect:** ambos observed:0, mas "moveu e não chegou" (partial) é distinto de "não saiu do lugar" (no_effect) — comparação de posição arredondada a 0.1 bloco.

## Deviations from Plan

None - plan executed exactly as written. Os blocos de código eram fornecidos verbatim no plano e foram aplicados sem alteração; typecheck e testes passaram na primeira execução.

## Issues Encountered
None. Único aviso recorrente foi o `LF will be replaced by CRLF` do Git no Windows (cosmético, sem impacto).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Contrato pronto para as Plans 02/03/04 da Fase 7 consumirem (`SkillResult`, `captureGroundState`, `evaluate*`).
- `grounding/` é base sem dependência de `skills/` — as skills passarão a importar daqui (inversão de dependência respeitada).
- Pendência conhecida fora deste plano: wiring real do captureGroundState dentro do executor/skills é trabalho das próximas plans (esta plan é só o contrato + predicados puros, conforme escopo Wave 0).

## Self-Check: PASSED

- Arquivos criados: types.ts, capture.ts, evaluate.ts, evaluate.test.ts — todos FOUND
- Commits: 47f17f2, 3508783, f22fcc6, 08312e2 — todos FOUND no histórico
- Verificações: `bun run typecheck` exit 0; `bun test src/grounding/evaluate.test.ts` 8 pass/0 fail; nenhum import de src/skills/ em src/grounding/

---
*Phase: 07-grounding-skillresult*
*Completed: 2026-06-19*
