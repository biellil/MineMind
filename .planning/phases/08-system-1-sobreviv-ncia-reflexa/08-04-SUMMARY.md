---
phase: 08-system-1-sobreviv-ncia-reflexa
plan: 04
subsystem: cognition
tags: [mineflayer, reflex, trigger-bus, langgraph, system-1, preemption]

# Dependency graph
requires:
  - phase: 08-01
    provides: "arbitrateReflex (função pura) + limiares de sobrevivência em config.ts"
  - phase: 08-02
    provides: "skills eat/attack grounded"
  - phase: 08-03
    provides: "skills flee/shelter grounded"
provides:
  - "TriggerBus emite 4 gatilhos lifeCritical (healthCritical/drowning/lavaAhead/fallAhead) via physicsTick edge-detection com histerese e null-safety"
  - "Preempção generalizada no nó execute para TODOS os gatilhos lifeCritical com setGoal(null) ANTES do abort (D-07)"
  - "System 1 fiado no driver (loop.ts): arbitrateReflex + dispatch de reflexo idle (eat/shelter) + MemEvent grounded debounced"
  - "Camada reflexa OBSERVÁVEL e ATIVA sem tocar o LLM/inFlight (preserva o [reflect], D-18/D-20)"
affects: [08.1, 09, 13-combate, 14-aprendizado]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Edge-detection em physicsTick (~20Hz) que só emite ao CRUZAR a borda (Pitfall 5), com histerese enter/exit"
    - "Preempção por N listeners (fábrica em loop) com setGoal(null) forçado antes do abort idempotente"
    - "Reflexo idle (lifeCritical=false) despachado fora do StateGraph, debounced por tipo, nunca toca o LLM/inFlight"

key-files:
  created: []
  modified:
    - src/cognition/trigger-bus.ts
    - src/cognition/nodes.ts
    - src/cognition/loop.ts

key-decisions:
  - "D-09/D-14: sensores ambientais (lava/queda/health/oxygen) lidos em physicsTick com edge-detection e histerese — sem flood"
  - "D-07: parada FORÇADA via setGoal(null) ANTES do abort do signal (não stop() gracioso)"
  - "D-02: lifeCritical=true preempta no execute; lifeCritical=false (eat/shelter) roda só quando idle no driver"
  - "D-18/D-19: reflexo re-percebe do zero ao terminar; MemEvent grounded debounced (>3s por tipo) para não inundar a memória"
  - "Pitfall 4/D-20: runReflex NUNCA chama provider/maybeDeliberate nem toca inFlight — o [reflect] não regrediu"

patterns-established:
  - "physicsTick edge-detector com histerese para gatilhos ambientais de alta frequência"
  - "preempção multi-gatilho com cleanup de N listeners no finally (remover antes do abort)"

requirements-completed: [SURV-01, SURV-02, SURV-03, SURV-04, SURV-05]

# Metrics
duration: ~42min
completed: 2026-06-20
---

# Phase 08 Plan 04: Integração System 1 Summary

**System 1 fiado de ponta a ponta — TriggerBus com 4 gatilhos lifeCritical via physicsTick edge-detection, preempção generalizada no execute com setGoal(null), e dispatch de reflexo idle (eat/shelter) no driver sem tocar o LLM.**

> **Nota de proveniência:** O código (Tasks 1-3) foi implementado e commitado em 2026-06-20. Este SUMMARY e o gate D-20 (Task 4) foram registrados retroativamente em 2026-06-22, quando o checkpoint de verificação humana AO VIVO foi finalmente executado e aprovado pelo usuário.

## Performance

- **Duration:** ~42 min (código)
- **Started:** 2026-06-20T18:54:20-03:00
- **Completed:** 2026-06-20T19:36:58-03:00 (código) / gate D-20 aprovado 2026-06-22
- **Tasks:** 4 (3 auto + 1 checkpoint human-verify)
- **Files modified:** 3

## Accomplishments
- TriggerBus emite `healthCritical`/`drowning`/`lavaAhead`/`fallAhead` por edge-detection em `physicsTick`, com histerese e guardas null-safe para morte/void.
- Preempção no nó `execute` generalizada de só `hostileNearby` para os 5 gatilhos `lifeCritical`, com `setGoal(null)` forçado ANTES do abort (D-07) e cleanup de todos os listeners no `finally`.
- System 1 fiado no driver (`loop.ts`): `buildReflexSensors` → `arbitrateReflex` → `runReflex` despacha eat/shelter quando idle, registra `MemEvent` grounded debounced, e nunca toca o LLM/inFlight.
- Gate D-20 confirmado AO VIVO: `[reflect] reflexão executada` dispara após o System 1 — a regressão B1 NÃO reapareceu.

## Task Commits

1. **Task 1: Gatilhos lifeCritical no TriggerBus** - `3edff01` (feat)
2. **Task 2: Generalizar preempção do execute** - `552455c` (feat)
3. **Task 3: Fiar o System 1 no driver** - `b96e3ce` (feat)
   - Follow-up: **fix** `6014d7a` (hostileNearby starvado + flee não despachado — bot não fugia)
4. **Task 4: Gate D-20 (human-verify)** - verificação ao vivo aprovada 2026-06-22 (sem código)

## Files Created/Modified
- `src/cognition/trigger-bus.ts` - 4 gatilhos lifeCritical via physicsTick edge-detection (histerese + null-safety), helpers `isLavaAhead`/`fallDepthAhead`, cleanup do listener.
- `src/cognition/nodes.ts` - `LIFE_CRITICAL_TRIGGERS` + preempção por N listeners com `setGoal(null)` antes do abort; remoção de todos no finally.
- `src/cognition/loop.ts` - `buildReflexSensors` + `runReflex` + dispatch de reflexo idle no ponto do `wakeReason`; `triggerCfg` estendido com os limiares da config.

## Decisions Made
None - plano executado conforme especificado (decisões D-02/D-07/D-09/D-14/D-18/D-19/D-20 já travadas no plano).

## Deviations from Plan

### Auto-fixed Issues

**1. [Comportamental] hostileNearby starvado — bot não fugia**
- **Found during:** Verificação após Task 3
- **Issue:** O reflexo `flee` não era despachado porque o gatilho `hostileNearby` ficava starvado no caminho idle.
- **Fix:** Correção da fiação do dispatch de reflexo (commit `6014d7a`).
- **Files modified:** src/cognition/loop.ts
- **Verification:** Suite de testes verde; comportamento reanalisado.
- **Committed in:** `6014d7a`

---

**Total deviations:** 1 auto-fixed (comportamental)
**Impact on plan:** Correção necessária para o reflexo de fuga funcionar. Sem scope creep.

## Issues Encountered
- O gate D-20 (human-verify AO VIVO) não foi executado na época da implementação (2026-06-20); o SUMMARY ficou pendente. Resolvido em 2026-06-22 com o teste ao vivo: `[reflect] reflexão executada` confirmado no log (regressão B1 não reapareceu). Os reflexos de sobrevivência (eat/flee/ambiental) não foram exercitados ao vivo nessa sessão (nenhuma situação os disparou); ficam cobertos pelos testes (tabela-verdade do `arbitrateReflex` + skills, suite 455 pass / 0 fail) e rastreados como UAT pendente.

## User Setup Required
None - nenhuma configuração de serviço externo. (Atenção operacional: conferir que `.env` não fixa `HUNGRY_THRESHOLD`/`SURVIVAL_CRITICAL_THRESHOLD` antigos, senão os defaults do Plan 01 não têm efeito.)

## Next Phase Readiness
- System 1 ativo e observável; camada reflexa completa (arbitragem + 4 skills + integração).
- UAT pendente: demonstração AO VIVO dos reflexos de sobrevivência (eat/flee/ambiental) em situação real.
- Achado fora de escopo observado no run de verificação: `gather:oak_log → dig` retorna `NO_EFFECT` em loop (comportamento de coleta/tech-tree, Fase 9/10), não relacionado à camada reflexa.

---
*Phase: 08-system-1-sobreviv-ncia-reflexa*
*Completed: 2026-06-20 (código) / 2026-06-22 (gate D-20)*
