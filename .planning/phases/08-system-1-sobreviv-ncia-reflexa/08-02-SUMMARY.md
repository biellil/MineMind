---
phase: 08-system-1-sobreviv-ncia-reflexa
plan: 02
subsystem: skills
tags: [reflex, system-1, survival, skill, eat, attack, grounding, bun-test]

# Dependency graph
requires:
  - phase: 07-grounding-skillresult
    provides: contrato SkillResult (outcome/observed/expected/delta) + padrão de skill grounded (navigate.ts)
  - phase: 08-system-1-sobreviv-ncia-reflexa (plan 01)
    provides: arbitrateReflex decide QUANDO comer/atacar; este plano entrega o COMO (primitivas de ação)
provides:
  - "eat(bot, params): skill reflexa que equipa a melhor comida, consome, re-equipa o item anterior, grounded por delta REAL de bot.food (D-05)"
  - "eat honra AbortSignal via bot.deactivateItem() (abort no meio da mastigação) e no_effect se abortado antes"
  - "attack(bot, params): 1-shot defensivo real (bot.attack) sem perseguir, substituindo o stub (D-15)"
  - "eat + attack registrados no skillRegistry/toolRegistry (consumíveis pelo System 1 no Plan 04)"
affects: [08-03-flee-shelter, 08-04-execute-abort]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Grounding vital LOCAL na skill (delta de bot.food) — NÃO estende o GroundState genérico (Pitfall 2)"
    - "Extração do signal de runtime ANTES do Zod parse (padrão navigate.ts) para honrar abort"
    - "Skill nunca lança como fluxo (D-08/D-12): consume() em try/catch, outcome deriva do delta observado"
    - "Re-equip best-effort do prevHeld após consumo (try/catch, não falha a skill)"
    - "attack 1-shot literal: no máximo 1 bot.attack por invocação — não invade combate real (Fase 13)"

key-files:
  created:
    - src/skills/eat.ts
    - src/skills/eat.test.ts
    - src/skills/attack.test.ts
  modified:
    - src/skills/attack.ts
    - src/skills/index.ts
    - src/skills/schemas.test.ts
    - src/skills/grounding.test.ts

key-decisions:
  - "D-05: comer = equip(food,'hand') → consume() → re-equip do heldItem salvo; seleção via bot.registry.foods ordenada por foodPoints desc; abort via deactivateItem()."
  - "Grounding vital LOCAL (Pitfall 2): eat mede bot.food antes/depois — outcome=success só se gained>0; expected=foodPoints da comida escolhida. NÃO mexe no GroundState."
  - "D-15: attack dá UM golpe via bot.attack no alvo nomeado mais próximo (nearestEntity), sem pathfinder/perseguição; alvo ausente vira no_effect (não throw)."
  - "Registro de eat foi mantido mínimo/aditivo em index.ts porque o Plan 08-03 também edita esse arquivo (merge limpo)."

patterns-established:
  - "Skill reflexa vital grounded por delta de stat do bot (food) em vez de inventário — modelo para health/oxygen futuras"
  - "Mock bot mínimo `as any` com stat mutável + spies (consume incrementa food, deactivateItem conta chamadas)"

requirements-completed: [SURV-01, SURV-02]

# Metrics
duration: 7min
completed: 2026-06-20
---

# Phase 8 Plan 02: Skills reflexas vitais (eat + attack) Summary

**Duas primitivas de ação grounded por delta REAL: `eat` (NOVA, D-05) equipa→consome→re-equipa a melhor comida medindo o ganho de `bot.food`, e `attack` (D-15) substitui o stub por um golpe defensivo 1-shot via `bot.attack` sem perseguir — ambas registradas no skillRegistry.**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-06-20
- **Completed:** 2026-06-20
- **Tasks:** 2 (ambas TDD)
- **Files modified:** 7 (3 criados, 4 modificados)

## Accomplishments
- `eat` (D-05/SURV-01): seleciona a comida de maior `foodPoints` em `bot.registry.foods`, equipa, `bot.consume()`, re-equipa o `prevHeld`; outcome derivado do delta real de `bot.food` (success só se ganhou, senão no_effect). Honra abort: `no_effect` se abortado antes, `bot.deactivateItem()` se abortar durante a mastigação.
- `attack` (D-15/SURV-02 defesa): stub removido; agora encontra o alvo nomeado mais próximo (`nearestEntity` por `name`/`username`) e dá UM golpe (`bot.attack`). Sem loop, sem pathfinder; alvo ausente → `no_effect` (nunca throw).
- `eat`/`eatTool` registrados no `skillRegistry` e `toolRegistry` (edição aditiva mínima para mergear limpo com o Plan 08-03).
- 13 testes novos (9 eat + 4 attack) cobrindo sucesso por delta, seleção por foodPoints, re-equip, sem-comida/cheio, abort antes/durante, consume que lança, e 1-shot (exatamente 1 golpe).

## Task Commits

Cada tarefa foi committada atomicamente (RED → GREEN):

1. **Task 1 (TDD RED): testes falhando de eat** - `657dd5a` (test)
2. **Task 1 (TDD GREEN): implementar eat (D-05)** - `c809d64` (feat)
3. **Task 2 (TDD RED): testes falhando de attack 1-shot** - `1c98b07` (test)
4. **Task 2 (TDD GREEN): attack 1-shot + registro de eat/attack** - `e0499b9` (feat)

_REFACTOR não foi necessário em nenhuma das tarefas (código limpo na fase GREEN)._

## Files Created/Modified
- `src/skills/eat.ts` - Skill reflexa eat: `eat`, `EatSchema`, `eatTool`; grounded por delta de `bot.food`, abort via `deactivateItem`.
- `src/skills/eat.test.ts` - 9 testes (sucesso/delta, seleção por foodPoints, re-equip, sem-comida, cheio, abort antes/durante, consume lança).
- `src/skills/attack.ts` - Stub substituído por 1-shot real (`bot.attack` no `nearestEntity` nomeado); `attackTool.description` atualizado (sem "[STUB]").
- `src/skills/attack.test.ts` - 4 testes (success por name/username, no_effect sem alvo, não-mais-stub).
- `src/skills/index.ts` - Importa/re-exporta `eat`; adiciona `eat` ao `skillRegistry` e `eatTool` ao `toolRegistry` (aditivo).
- `src/skills/schemas.test.ts` - Asserts de registry atualizados de 4 → 5 skills/tools incluindo `eat`.
- `src/skills/grounding.test.ts` - Bloco de contrato do attack atualizado: stub (outcome:error) → 1-shot (no_effect sem alvo).

## Decisions Made
- **Grounding vital LOCAL (Pitfall 2):** `eat` mede `bot.food` antes/depois e NÃO toca o `GroundState`/evaluators genéricos — menor blast radius, preserva GRND-01/D-19.
- **D-15 1-shot literal:** `attack` chama `bot.attack` no máximo 1 vez por invocação; combate real (manter alvo/kiting) fica para a Fase 13.
- **Edição aditiva em index.ts:** registro de `eat` minimizado porque o Plan 08-03 (flee/shelter) também edita o mesmo arquivo.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Asserções de registry desatualizadas em schemas.test.ts**
- **Found during:** Task 2 (registro de eat)
- **Issue:** `schemas.test.ts` afirmava exatamente `['navigate','dig','follow','attack']` e `toHaveLength(4)`; registrar `eat` (objetivo do plano) tornava essas asserções incorretas e quebrava o critério de aceite "schemas.test.ts continua verde".
- **Fix:** Atualizar os três asserts para 5 skills/tools incluindo `eat`.
- **Files modified:** src/skills/schemas.test.ts
- **Verification:** `bun test src/skills/schemas.test.ts` → verde.
- **Committed in:** `e0499b9` (Task 2 commit)

**2. [Rule 1 - Bug] Teste de contrato do attack ainda esperava o stub em grounding.test.ts**
- **Found during:** Task 2 (substituição do stub de attack)
- **Issue:** `grounding.test.ts` tinha `describe('attack (stub)...')` afirmando `outcome:'error'` + reason "não implementada" e passava `{}` como bot (sem `nearestEntity`), o que agora lança. A asserção testava exatamente o comportamento que este plano remove.
- **Fix:** Reescrever o bloco para o novo contrato 1-shot: bot mínimo com `nearestEntity: () => null` → `no_effect` (não throw); mantido o teste de validação Zod.
- **Files modified:** src/skills/grounding.test.ts
- **Verification:** `bun test src/skills/` → 52 pass / 0 fail; `bun test` (suíte completa) → 315 pass / 0 fail.
- **Committed in:** `e0499b9` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 bugs — testes desatualizados que o próprio objetivo do plano invalidava)
**Impact on plan:** Ambos eram correções obrigatórias para os testes refletirem o novo contrato (5 skills; attack não-stub). Sem scope creep — escopo restrito aos arquivos do plano.

## Issues Encountered
None — tarefas executadas conforme o plano (tirando os dois desvios de teste acima, esperados ao introduzir/registrar a skill).

## User Setup Required
None - zero dependência nova; tudo via API nativa Mineflayer. `bot.registry.foods` tem fallback documentado na RESEARCH caso a forma divirja em runtime (verificação AO VIVO, não bloqueante).

## Known Stubs
- `src/skills/follow.ts` permanece stub (fora do escopo deste plano; será tratado em fase futura de social/seguir). attack NÃO é mais stub.

## Next Phase Readiness
- `eat` e `attack` estão no `skillRegistry`, prontos para o System 1 (Plan 08-04) disparar por preempção.
- Plan 08-03 (flee/shelter) edita `src/skills/index.ts` — o registro de `eat` foi mantido aditivo para merge limpo.
- Lembrete (STATE.md): re-testar `[reflect]` AO VIVO depois que o System 1 estiver conectado (a nova camada muda quando o lock do LLM fica livre).
- Open Question #3 da RESEARCH: confirmar a forma exata de `bot.registry.foods` (chave `it.type` / campo `foodPoints`) no primeiro uso AO VIVO — baixo risco, leitura.

---
*Phase: 08-system-1-sobreviv-ncia-reflexa*
*Completed: 2026-06-20*

## Self-Check: PASSED
- Arquivos confirmados em disco: eat.ts, eat.test.ts, attack.ts, attack.test.ts, index.ts, 08-02-SUMMARY.md.
- Commits confirmados: 657dd5a, c809d64, 1c98b07, e0499b9.
- Suíte completa verde: `bun test` → 315 pass / 1 skip / 0 fail.
