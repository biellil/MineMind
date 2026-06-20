---
phase: 08-system-1-sobreviv-ncia-reflexa
plan: 01
subsystem: cognition
tags: [reflex, system-1, survival, pure-function, config, bun-test]

# Dependency graph
requires:
  - phase: 07.1-loop-agentico
    provides: TriggerBus + limiares hostileRadius/hungryThreshold reusados pela camada reflexa
provides:
  - "arbitrateReflex(sensors): função pura winner-take-all que decide o reflexo vencedor por gravidade (D-01/D-03)"
  - "Helpers puros hostileThreatDistance/isHostileThreat (reação graduada por tipo de mob, D-13)"
  - "Tipos ReflexSensors/ReflexDecision (contrato de entrada/saída da decisão reflexa)"
  - "Limiares de sobrevivência em config.ts (hunger/health/oxygen enter+exit, fall, lava, distâncias por mob) com validação de range e histerese"
affects: [08-02-skills-reflexas, 08-03-preempcao, 08-04-execute-abort]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Decisão reflexa como função pura no driver (D-01) — separada do abort físico do nó execute"
    - "Array de guardas ordenadas por gravidade + winner-take-all (primeiro não-nulo vence)"
    - "Tabela-verdade testável sem mock de bot (objetos ReflexSensors literais), espelhando arbiter.test.ts"
    - "Histerese enter/exit em config (limiares separados para entrar/sair de cada reflexo)"

key-files:
  created:
    - src/cognition/reflex.ts
    - src/cognition/reflex.test.ts
  modified:
    - src/config.ts
    - src/config.test.ts

key-decisions:
  - "D-17: shelter não é guarda isolada por anoitecer — é variação do caminho hostil (cornered+noite+hostil → shelter; cornered de dia → defend; com fuga → flee). Fixado em teste."
  - "D-02: fome é o único reflexo com lifeCritical=false (nunca preempta); ambiental/hostil/queda/vida-crítica são lifeCritical=true."
  - "D-03 ordem de gravidade: ambiental (lava/afogamento) > hostil > queda > vida-crítica sem ameaça > fome."
  - "Teste de defaults de config limpa env do .env local ANTES do primeiro import (config é singleton cacheado) — torna o teste determinístico e mata o fail pré-existente do config."

patterns-established:
  - "Função pura no driver: reflex.ts importa só config, nunca Bot — toda a DECISÃO é testável por tabela-verdade"
  - "Reação graduada por tipo de mob via name-matching (creeper 10 / skeleton ranged 16 / melee 8)"

requirements-completed: [SURV-01, SURV-02, SURV-03, SURV-04, SURV-05]

# Metrics
duration: 12min
completed: 2026-06-20
---

# Phase 8 Plan 01: Fundação da camada reflexa (System 1) Summary

**`arbitrateReflex` — função pura winner-take-all que decide o reflexo vencedor (eat/flee/shelter/retreatEnv/defend) por ordem de gravidade D-03, mais 9 novos limiares de sobrevivência validados em config.ts.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-06-20
- **Completed:** 2026-06-20
- **Tasks:** 2
- **Files modified:** 4 (2 criados, 2 modificados)

## Accomplishments
- `arbitrateReflex` puro (winner-take-all, D-01): percorre `REFLEX_GUARDS` ordenadas por gravidade e devolve o primeiro reflexo não-nulo ou `null` — zero import de `Bot`.
- Reação graduada por tipo de mob (D-13): creeper reage a ≤10, skeleton (ranged) ≤16, melee genérico ≤8, via `hostileThreatDistance`/`isHostileThreat`.
- 9 novos limiares de sobrevivência em `config.ts` (D-11..D-14) com validação de range e histerese enter/exit, mais flips `hungryThreshold` 6→16 e `survivalCriticalThreshold` 0.3→0.5.
- Tabela-verdade de 21 testes cobrindo SURV-01..05, ordenação D-03, distâncias graduadas e estado saudável→null — sem mock de bot.

## Task Commits

Each task was committed atomically:

1. **Task 1: Limiares de sobrevivência em config.ts + validação + testes** - `0c3c1d2` (feat)
2. **Task 2 (TDD RED): tabela-verdade falha de arbitrateReflex** - `ac7b0bc` (test)
3. **Task 2 (TDD GREEN): implementar arbitrateReflex puro** - `ba3fe3a` (feat)

_TDD task: REFACTOR não foi necessário (código já limpo na fase GREEN)._

## Files Created/Modified
- `src/cognition/reflex.ts` - Decisão reflexa pura: `arbitrateReflex`, `REFLEX_GUARDS`, helpers `hostileThreatDistance`/`isHostileThreat`, tipos `ReflexSensors`/`ReflexDecision`.
- `src/cognition/reflex.test.ts` - Tabela-verdade de 21 testes (SURV-01..05 + ordenação + helpers).
- `src/config.ts` - Limiares reflexos D-11..D-14 + validação de range/histerese; flips de hungryThreshold e survivalCriticalThreshold.
- `src/config.test.ts` - Asserts de default dos novos limiares (com limpeza de env determinística).

## Decisions Made
- **D-17 (shelter):** representado como variação do caminho hostil dentro da guarda hostil — `cornered && isNight && hostil → shelter`, `cornered && dia → defend`, senão `flee`. Anoitecer sozinho nunca dispara reflexo. Comportamento fixado em teste.
- **D-03 ordenação:** ambiental > hostil > queda > vida-crítica > fome, provada por teste de cenários simultâneos.
- **D-02 lifeCritical:** só fome é `false`; todo o resto é `true`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Teste de default de config não-determinístico por `.env` local**
- **Found during:** Task 1 (asserts de default em config.test.ts)
- **Issue:** O `.env` de dev seta `SURVIVAL_CRITICAL_THRESHOLD=0.3`, mascarando o novo default 0.5. Como `config.ts` é um singleton avaliado/cacheado no primeiro import, limpar o env dentro do teste não bastava (o módulo já estava avaliado). Era também a causa do fail pré-existente do config documentado no PROJECT.md.
- **Fix:** Deletar as env vars relevantes no topo de `config.test.ts` (module-load, antes de qualquer import de `./config`), afirmando os DEFAULTS do código de forma determinística.
- **Files modified:** src/config.test.ts
- **Verification:** `bun test src/config.test.ts` → 3 pass / 0 fail (antes 1 fail).
- **Committed in:** `0c3c1d2` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug — teste não-determinístico)
**Impact on plan:** Correção necessária para o teste refletir o contrato (default), sem scope creep. Bônus: resolve o fail pré-existente do config.

## Issues Encountered
None — tarefas executadas conforme o plano (tirando o desvio acima).

## User Setup Required
None - nenhuma configuração de serviço externo necessária. Novos limiares têm defaults; opcionalmente sobrescrevíveis por env (HEALTH_CRITICAL_THRESHOLD, OXYGEN_EMERGE_THRESHOLD, etc.).

## Next Phase Readiness
- A "função pura no driver" do D-01 está pronta para ser consultada pelas skills reflexas (Plan 02) e pela generalização da preempção (Plan 03-04).
- `arbitrateReflex` é o ponto único de DECISÃO; o ABORT FÍSICO fica no nó execute (Plan 04) — separação respeitada.
- Lembrete de STATE.md: re-testar `[reflect]` AO VIVO depois que o System 1 estiver conectado (a nova camada muda quando o lock do LLM fica livre).

---
*Phase: 08-system-1-sobreviv-ncia-reflexa*
*Completed: 2026-06-20*

## Self-Check: PASSED
- Arquivos criados/modificados confirmados em disco (reflex.ts, reflex.test.ts, config.ts, config.test.ts, 08-01-SUMMARY.md).
- Commits confirmados: 0c3c1d2, ac7b0bc, ba3fe3a.
