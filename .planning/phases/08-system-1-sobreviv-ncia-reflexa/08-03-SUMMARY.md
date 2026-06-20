---
phase: 08-system-1-sobreviv-ncia-reflexa
plan: 03
subsystem: skills
tags: [reflex, system-1, survival, skill, flee, shelter, pathfinder, grounding, bun-test]

# Dependency graph
requires:
  - phase: 07-grounding-skillresult
    provides: contrato SkillResult (outcome/observed/expected/delta) + padrão de skill grounded (navigate.ts/dig.ts)
  - phase: 08-system-1-sobreviv-ncia-reflexa (plan 01)
    provides: arbitrateReflex decide QUANDO fugir/abrigar; este plano entrega o COMO (primitivas de ação)
  - phase: 999.1-pathfinder-bounds
    provides: bounds do A* (searchRadius/thinkTimeout) + navigateTimeoutMs herdados por toda nova navegação
provides:
  - "flee(bot, params): skill reflexa que foge do mob hostil mais próximo via GoalInvert(GoalFollow) + setGoal(goal,true), com fallback sprint cego quando o A* falha (D-06)"
  - "flee honra AbortSignal via bot.pathfinder.setGoal(null) FORÇADO (D-07) + limpa controlStates do sprint; grounded por delta REAL de distância ao mob"
  - "shelter(bot, params): abrigo de emergência condicional cavar-e-tampar OU pilar 1×1 (D-08) com placeBlock mínimo e guarda anti-lava/caverna"
  - "flee + shelter registrados no skillRegistry/toolRegistry (consumíveis pelo System 1 no Plan 04)"
affects: [08-04-execute-abort]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Grounding por delta REAL de distância ao mob (flee) e de cobertura por blockAt (shelter) — não pela resolução da Promise"
    - "Abort de navegação reflexa via setGoal(null) FORÇADO (D-07), nunca stop() gracioso — latência sub-segundo"
    - "Fallback determinístico: A* (GoalInvert) → sprint cego (setControlState forward+sprint) quando goto rejeita noPath/timeout/stuck"
    - "placeBlock mínimo em try/catch (robustez definitiva = Fase 9); skill nunca lança como fluxo (D-08/D-12)"
    - "Guarda anti-lava/caverna: checa blockAt 2 abaixo (UNSAFE_BELOW) antes de cavar — não cair em vazio/lava/água"
    - "Extração do signal de runtime ANTES do Zod parse (padrão navigate.ts/eat.ts) para honrar abort"

key-files:
  created:
    - src/skills/flee.ts
    - src/skills/flee.test.ts
    - src/skills/shelter.ts
    - src/skills/shelter.test.ts
  modified:
    - src/skills/index.ts
    - src/skills/schemas.test.ts

key-decisions:
  - "D-06: fugir = GoalInvert(new GoalFollow(mob, radius)) + setGoal(goal, true) dynamic (GoalRunAway não existe); fallback sprint cego no vetor oposto só quando o A* devolve noPath/timeout/stuck."
  - "D-07: abort/parada da navegação reflexa usa bot.pathfinder.setGoal(null) (forçado/imediato), NÃO bot.pathfinder.stop() (gracioso). clearSprint também roda no abort."
  - "D-08: shelter decide cavar-e-tampar quando há base sólida 2 abaixo (sem lava/água/ar) e cai para pilar 1×1 em terreno plano/inseguro; placeBlock é mínimo (1 chamada try/catch)."
  - "SURV-05: flee herda os bounds do 999.1 — navigateTimeoutMs no executeWithSafety; o A* em si usa o searchRadius/thinkTimeout do Movements global configurado no boot."
  - "Grounding: flee mede distância ao mob antes/depois (gained>1=success, >0=partial, senão no_effect); shelter mede cobertura via blockAt 2 acima (coberto=success, senão partial)."
  - "Registro de flee/shelter em index.ts mantido aditivo sobre eat/attack do Plan 02 (skillRegistry/toolRegistry agora com 7 entradas)."

patterns-established:
  - "Skill reflexa de evasão grounded por delta geométrico (distância) — modelo para futuras reações posicionais"
  - "Fallback A*→sprint cego como padrão de robustez quando o pathfinder falha em emergência"
  - "Mock bot mínimo `as any` com Vec3-like (distanceTo/offset) + spies de setGoal/goto/placeBlock/setControlState"

metrics:
  duration_minutes: 6
  tasks_completed: 2
  files_touched: 6
  tests_added: 13
  completed_date: 2026-06-20
---

# Phase 8 Plan 3: Skills Reflexas de Evasão (flee + shelter) Summary

Duas primitivas de ação do System 1, ambas grounded por delta real e sem dependência nova: `flee` foge do mob hostil via `GoalInvert(GoalFollow)` com fallback de sprint cego e abort forçado por `setGoal(null)` (D-06/D-07); `shelter` cria abrigo de emergência decidindo entre cavar-e-tampar e pilar 1×1 com `placeBlock` mínimo e guarda anti-lava (D-08). Ambas registradas no `skillRegistry` para o System 1 disparar por preempção no Plan 04.

## What Was Built

### Task 1 — flee (D-06)
`src/skills/flee.ts` + `flee.test.ts`. Localiza o mob (por nome ou hostil mais próximo via `kind === 'Hostile mobs'`), cria `GoalInvert(new goals.GoalFollow(mob, radius))` e chama `setGoal(goal, true)` (dynamic) dentro do `executeWithSafety` (herdando `navigateTimeoutMs` — SURV-05). Quando o A* rejeita com noPath/timeout/stuck e o abort não foi disparado, cai para `blindSprintAway` (olha o vetor oposto + `setControlState('forward'/'sprint', true)` por ~600ms, depois limpa). Abort → `bot.pathfinder.setGoal(null)` forçado (D-07) + `clearSprint`. O outcome deriva do delta de distância ao mob (`gained>1`=success, `>0`=partial, senão no_effect). 7 testes.

### Task 2 — shelter (D-08) + registro
`src/skills/shelter.ts` + `shelter.test.ts`. Seleciona um bloco colocável (`PLACEABLE` = planks/log/cobblestone/stone/dirt/netherrack/deepslate); sem bloco → no_effect. Lê `blockAt(pos.offset(0,-2,0))`: se sólido e seguro (`!UNSAFE_BELOW`) → cava o bloco 1 abaixo e tampa o topo; senão → pilar 1×1 (equip → lookAt baixo → jump → placeBlock sob os pés). `placeBlock`/`dig` em try/catch (mínimo — Fase 9 robustece). Grounding por cobertura: `blockAt(pos.offset(0,2,0))` sólido = success. 6 testes. `index.ts` recebe imports, re-exports e entradas em `skillRegistry`/`toolRegistry` de forma aditiva sobre eat/attack.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] schemas.test.ts hard-codava a lista do registry**
- **Found during:** Task 2 (`bun test src/skills/schemas.test.ts`)
- **Issue:** As três asserções de `skillRegistry`/`toolRegistry` fixavam a lista em 5 entradas (`navigate, dig, follow, attack, eat`). A registração aditiva mandatória de flee/shelter (acceptance criteria do plano) quebrava essas asserções por dessincronia, não por bug de produção.
- **Fix:** Atualizadas as três asserções para 7 entradas incluindo `flee, shelter`, preservando a ordem aditiva.
- **Files modified:** src/skills/schemas.test.ts
- **Commit:** df54236

**2. [Rule 1 - Bug] Mock de shelter sem bot.lookAt fazia o branch pilar cair no catch**
- **Found during:** Task 2 (RED→GREEN; 3 testes do branch pilar falhavam com `partial`)
- **Issue:** O mock de teste não definia `bot.lookAt`; o branch pilar (`await bot.lookAt(...)`) lançava e pulava o `placeBlock`, mascarando o comportamento real. Bug no test fixture, não na skill (o bot real tem `lookAt`).
- **Fix:** Adicionado `lookAt: async () => {}` ao mock bot de shelter.test.ts.
- **Files modified:** src/skills/shelter.test.ts
- **Commit:** df54236

## Verification

- `bun test src/skills/flee.test.ts src/skills/shelter.test.ts src/skills/schemas.test.ts` → 30 pass / 0 fail.
- Acceptance greps Task 1: GoalInvert(4), GoalFollow(3), setGoal(null)(3), setControlState sprint(2), bounds 999.1(1), test( count 7. Todos ≥ alvo.
- Acceptance greps Task 2: bot.placeBlock(2), bot.blockAt(5), lava(3), flee|shelter em index(8), test( count 6. Todos ≥ alvo.
- `bunx tsc --noEmit` sem erros nos arquivos do plano.

## Success Criteria Status

- SURV-02 (fuga): flee aumenta a distância ao mob via GoalInvert ou sprint cego — coberto por testes de delta.
- SURV-03: shelter cria abrigo de emergência cavar-vs-pilar com guarda anti-lava — ambos os branches cobertos.
- SURV-05: bounds 999.1 aplicados (navigateTimeoutMs); abort por setGoal(null) forçado (D-07).
- Zero dependência nova; placeBlock mínimo (robusto = Fase 9).

## Handoff to Plan 04

- `skillRegistry`/`toolRegistry` agora expõem `flee` e `shelter` além de `eat`/`attack` — o System 1 (Plan 04) pode disparar essas skills por preempção.
- O abort forçado de flee (`setGoal(null)`) é a contraparte da generalização do listener de preempção descrita no RESEARCH (nodes.ts: hostileNearby → todos lifeCritical) que o Plan 04 implementa.
- Robustez do `placeBlock` do shelter é intencionalmente mínima — Fase 9 (building) assume o abrigo robusto/definitivo.

## Self-Check: PASSED

- Arquivos criados verificados: flee.ts, flee.test.ts, shelter.ts, shelter.test.ts, 08-03-SUMMARY.md — todos FOUND.
- Commits verificados: 5c69f0e (flee), df54236 (shelter + registro) — ambos FOUND.
