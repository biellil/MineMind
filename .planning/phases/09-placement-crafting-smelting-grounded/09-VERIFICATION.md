---
phase: 09-placement-crafting-smelting-grounded
verified: 2026-06-21T00:00:00Z
status: gaps_found
score: 13/13 capability must-haves verified; 1 behavioral integration gap (G-01) found on re-review
re_verification: true
---

# Phase 9: Placement + Crafting/Smelting Grounded Verification Report

**Phase Goal:** O agente posiciona blocos de forma confiável e crafta/funde/equipa itens com verificação grounded — o primitivo `placeBlock` robusto é implementado uma vez (compartilhado por abrigo, building e estações) e a cadeia tábuas→bancada→ferramenta→fornalha→ferro produz resultados verídicos confirmados pelo inventário.
**Verified:** 2026-06-21
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (from ROADMAP Success Criteria + PLAN must_haves)

| #   | Truth                                                                                                                           | Status     | Evidence                                                                                                                              |
| --- | ----------------------------------------------------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 1   | placeBlock confiável: deriva outcome de `bot.blockAt(alvo)`, engole timeout `blockUpdate` como falso-negativo, equipa item, face correta | ✓ VERIFIED | placeBlock.ts:104 equip; :108-112 swallow total; :115 `isFilled` pós-check; :120-124 outcome de blockAt; FALSE_NEGATIVE/GENUINE_FAIL regex :24-25 |
| 2   | getRefAndFace puro: ref sólido + face exposta, faceVector correto (preferência face de baixo)                                   | ✓ VERIFIED | placeBlock.ts:67-83 puro (só blockAt), FACES `[0,-1,0]` primeiro, retorna -faceVector, null se cercado; 4 testes verdes              |
| 3   | placeBlock implementado UMA VEZ — shelter consome placeBlockSafe/getRefAndFace (D-05), nenhuma chamada crua resta              | ✓ VERIFIED | shelter.ts:18 import; :70/:95 placeBlockSafe nos 2 branches; grep de `bot.placeBlock(` ativo = 0; UNSAFE_BELOW + grounding preservados |
| 4   | craft grounded por delta de inventário; gate de mesa retorna no_effect SEM deixar bot.craft lançar (Pitfall 4)                  | ✓ VERIFIED | craft.ts:67-69 no_effect ANTES do bot.craft (:76); evaluateCraft :86; expected = result.count*count :85; teste "bot.craft not called" verde |
| 5   | ensureStation localiza/navega/posiciona + registra POI 'station' (best-effort), re-valida por findBlock (POI é cache)          | ✓ VERIFIED | station.ts ensureStation findBlock→GoalNear→fallback placeBlockSafe→re-findBlock; upsertPlace POI 'station'; 3 caminhos testados      |
| 6   | smelt funde 1 item por chamada, close() obrigatório no finally, grounded por delta do produto (outputItem é verdade)            | ✓ VERIFIED | smelt.ts:149-150 close() no finally; :143 putInput 1; :145 outputItem() captura nome; evaluateSmelt :156; teste close-on-throw verde  |
| 7   | equip standalone grounded por estado LOCAL (heldItem/slot armadura), NÃO por delta; selectToolFor binário sem ranking de tier  | ✓ VERIFIED | equip.ts evaluateEquip local, sem captureGroundState; selectToolFor `.find` (primeiro match, sem tier); teste "no ranking" verde     |
| 8   | dig/attack fazem pré-flight selectToolFor antes de agir (rede de segurança B2), best-effort                                     | ✓ VERIFIED | dig.ts:48 selectToolFor(bot,'pickaxe') em try/catch; attack.ts:39 selectToolFor(bot,'weapon') em try/catch                           |
| 9   | evaluateCraft/Smelt classificam por delta do item-alvo; evaluateEquip por estado local                                         | ✓ VERIFIED | evaluate.ts:52-67 craft (Math.max(0,delta[target])); :74-82 smelt delega; :90-97 equip booleano; testes verdes                       |
| 10  | PlaceType aceita 'station'; 4 timeouts em config com validação de range                                                        | ✓ VERIFIED | persistence.ts union contém 'station'; config carrega placeTimeoutMs=6000/smeltUpdateTimeoutMs=12000/smeltTimeoutMs=15000/placeRetries=0 sem throw |
| 11  | As 4 skills (placeBlock/craft/smelt/equip) registradas em skillRegistry + toolRegistry                                          | ✓ VERIFIED | index.ts:52-64 skillRegistry; :71-83 toolRegistry; runtime check `skills ok: true | tools: 11`                                       |
| 12  | Testes da Fase 7/8 (shelter/dig/attack) continuam verdes após refator                                                          | ✓ VERIFIED | 64 testes de fase verdes; suite global 420 pass / 0 fail / 1 skip                                                                    |
| 13  | Cadeia tábuas→bancada→ferramenta→fornalha→ferro produz resultado verídico confirmado pelo inventário                            | ✓ VERIFIED | craft (delta) + ensureStation (bancada/fornalha como Block real) + smelt (outputItem/delta) + equip (local) — wiring completo e tipado |

**Score:** 13/13 truths verified

### Required Artifacts

| Artifact                       | Expected                                                  | Status     | Details                                                  |
| ------------------------------ | -------------------------------------------------------- | ---------- | -------------------------------------------------------- |
| `src/skills/placeBlock.ts`     | placeBlockSafe + getRefAndFace + schema + tool           | ✓ VERIFIED | Exists, substantive, wired (shelter/station/index)       |
| `src/grounding/evaluate.ts`    | evaluateCraft/Smelt/Equip                                | ✓ VERIFIED | 3 funções puras, importadas por craft/smelt/equip        |
| `src/memory/persistence.ts`    | PlaceType += 'station'                                    | ✓ VERIFIED | Union contém 'station'                                   |
| `src/config.ts`                | 4 timeouts + validação                                   | ✓ VERIFIED | Carrega sem throw; valores válidos                       |
| `src/skills/shelter.ts`        | refator consumindo placeBlockSafe                        | ✓ VERIFIED | 0 chamadas cruas; branches + grounding preservados       |
| `src/skills/station.ts`        | ensureStation (find|navigate|place + POI)                | ✓ VERIFIED | Exists, wired a places/placeBlock/craft/smelt            |
| `src/skills/craft.ts`          | craft + gate de mesa + grounded                          | ✓ VERIFIED | Gate antes do bot.craft; evaluateCraft                   |
| `src/skills/smelt.ts`          | smelt por item + close() finally                         | ✓ VERIFIED | close() garantido; outputItem truth                      |
| `src/skills/equip.ts`          | equip + selectToolFor                                    | ✓ VERIFIED | Local grounding; binário sem tier                        |
| `src/skills/dig.ts`            | pré-flight selectToolFor('pickaxe')                      | ✓ VERIFIED | try/catch best-effort                                    |
| `src/skills/attack.ts`         | pré-flight selectToolFor('weapon')                       | ✓ VERIFIED | try/catch best-effort                                    |
| `src/skills/index.ts`          | registro das 4 skills                                    | ✓ VERIFIED | skillRegistry + toolRegistry (11 tools)                  |

### Key Link Verification

| From               | To                       | Via                          | Status  |
| ------------------ | ------------------------ | ---------------------------- | ------- |
| placeBlock.ts      | grounding/types.ts       | import SkillResult           | ✓ WIRED |
| placeBlock.ts      | executor.ts              | executeWithSafety            | ✓ WIRED |
| shelter.ts         | placeBlock.ts            | placeBlockSafe + getRefAndFace | ✓ WIRED |
| craft.ts           | station.ts               | import ensureStation         | ✓ WIRED |
| station.ts         | memory/places.ts         | upsertPlace POI 'station'    | ✓ WIRED |
| station.ts         | placeBlock.ts            | fallback placeBlockSafe      | ✓ WIRED |
| index.ts           | craft.ts                 | skillRegistry/toolRegistry   | ✓ WIRED |
| equip.ts           | grounding/evaluate.ts    | import evaluateEquip         | ✓ WIRED |
| dig.ts             | equip.ts                 | import selectToolFor         | ✓ WIRED |

All 9 key links verified via gsd-tools (`all_verified: true` across all 4 plans).

### Data-Flow Trace (Level 4)

| Artifact     | Data Variable        | Source                                  | Produces Real Data | Status     |
| ------------ | -------------------- | --------------------------------------- | ------------------ | ---------- |
| placeBlock   | outcome/observed     | `bot.blockAt(targetPos)` pós-ação       | Yes (world truth)  | ✓ FLOWING  |
| craft        | observed             | `inventoryDelta(before, after)`         | Yes (real delta)   | ✓ FLOWING  |
| smelt        | observed/smeltedName | `furnace.outputItem()` + delta          | Yes (furnace truth)| ✓ FLOWING  |
| equip        | equipped             | `bot.heldItem` / `inventory.slots`      | Yes (local state)  | ✓ FLOWING  |
| ensureStation| block                | `bot.findBlock` (re-validado pós-place) | Yes (world truth)  | ✓ FLOWING  |

No hardcoded/empty data sources. Every grounded outcome derives from world/inventory state, not the Promise resolution — the core anti-"peguei 10 tábuas" guarantee holds.

### Behavioral Spot-Checks

| Behavior                                  | Command                                              | Result                          | Status |
| ----------------------------------------- | ---------------------------------------------------- | ------------------------------- | ------ |
| Phase test suites pass                    | `bun test` (9 phase files)                           | 64 pass / 0 fail                | ✓ PASS |
| No regression in global suite             | `bun test`                                           | 420 pass / 0 fail / 1 skip      | ✓ PASS |
| 4 skills registered + tools count         | import index.ts runtime check                        | `skills ok: true | tools: 11`   | ✓ PASS |
| Config validates + loads timeouts         | import config.ts runtime check                       | `6000 12000 15000 0` (no throw) | ✓ PASS |
| TypeScript compiles                       | `bunx tsc --noEmit`                                  | exit 0                          | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan(s)     | Description                                                         | Status      | Evidence                                                  |
| ----------- | ------------------ | ------------------------------------------------------------------ | ----------- | --------------------------------------------------------- |
| BUILD-01    | 01, 02, 03         | Coloca blocos de forma confiável (placeBlock + verificação/timeout)| ✓ SATISFIED | placeBlockSafe grounded + registrado + consumido por shelter/station |
| CRAFT-01    | 03                 | Crafta verificando inventário antes/depois (grounded)              | ✓ SATISFIED | craft.ts via captureGroundState + evaluateCraft           |
| CRAFT-02    | 03                 | Posiciona e usa bancada quando a receita exige (3x3)               | ✓ SATISFIED | ensureStation('crafting_table') + recipesFor(table)       |
| CRAFT-03    | 03                 | Funde minérios na fornalha e recupera o resultado                  | ✓ SATISFIED | smelt.ts putFuel→putInput→takeOutput + close() finally    |
| CRAFT-04    | 04                 | Equipa a ferramenta/armadura apropriada do inventário              | ✓ SATISFIED | equip standalone + selectToolFor pré-flight em dig/attack  |

All 5 declared requirement IDs accounted for. No ORPHANED requirements — REQUIREMENTS.md maps exactly BUILD-01 + CRAFT-01..04 to Phase 9, all claimed by plans, all marked Complete in REQUIREMENTS.md mapping table.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| (none) | — | No TODO/FIXME/placeholder/stub in any of the 5 new skill files | — | — |

**Note (intentional, not a gap):** `config.placeRetries` defaults to 0 and the retry loop body in placeBlockSafe is deliberately NOT implemented (D-04, documented in 09-01-PLAN.md notes and ROADMAP Deferred). This is a tracked gap reserved for a future phase, gated on live testing showing need — the idempotency guard IS present. Not counted against goal achievement.

### Human Verification Required

None blocking. The following are inherently runtime/live-server behaviors validated by mocked unit tests but worth a live smoke test when a Minecraft server is available:

### 1. Falso-negativo do timeout ao vivo
**Test:** Em servidor lagado, colocar um bloco e forçar o timeout de blockUpdate.
**Expected:** placeBlock reporta 'success' (não 'error') quando o bloco realmente apareceu.
**Why human:** Requer servidor real com lag; unit test cobre o caminho com mock.

### 2. Ciclo completo de smelt ao vivo
**Test:** Fundir iron_ore com charcoal numa fornalha real.
**Expected:** iron_ingot no inventário, fornalha fechada, sem travar o loop ~10s.
**Why human:** Timing assíncrono real da fornalha; unit test usa EventEmitter mock.

### Gaps Summary

**Capability layer: PASS.** All 13 observable truths verified, all 12 artifacts pass levels 1-4 (exist, substantive, wired, data flowing), all 9 key links wired. Full test suite (420 tests) green, TypeScript compiles clean, registry/config load at runtime.

**Behavioral layer: 1 GAP (G-01).** On re-review against the literal requirement text ("**O agente** crafta/funde/coloca…"), the autonomous agent never actually invokes craft/smelt/equip/placeBlock at runtime. The skills are built, tested, grounded, and registered — but they are **not reachable from the decision loop**. CRAFT-01/02/03 and BUILD-01 are true at the *capability* level (skill-when-invoked) but NOT at the *behavioral* level (agent-acts-autonomously).

## Gaps

### G-01: craft/smelt/equip/placeBlock não fiados à decisão do agente (integration gap)

**Status:** failed
**Requirements affected:** CRAFT-01, CRAFT-02, CRAFT-03, BUILD-01 (behavioral reading)
**Severity:** integration — capability exists, decision surface does not reach it

**Evidence (code-verified):**
- `src/llm/schemas.ts:23` — `ActionDecisionSchema.action` is a CLOSED enum: `['gather','explore','navigate','idle','chat']`. There is no `craft`/`smelt`/`equip`/`place` value, so the LLM cannot choose to craft, smelt, equip, or place a block.
- `src/cognition/nodes.ts:184-225` (`execute` node) maps cognitive state → skill for ONLY `dig` (gathering) and `navigate` (exploring/socializing). No branch dispatches `craft`/`smelt`/`equip`/`placeBlock` from `skillRegistry`.
- `toolRegistry` (`src/skills/index.ts:71-83`) is consumed by NO runtime code — it is never fed into the LLM prompt. (`placeBlock` runs only indirectly via `shelter` in System 1; `equip`'s `selectToolFor` runs only as a dig/attack pre-flight. The standalone verbs `craft`/`smelt`/`equip`/`placeBlock` are dormant.)

**Required to close (MINIMAL decision-wiring — scope-bounded):**
1. Open the LLM decision surface so the agent CAN choose the new verbs — extend `ActionDecisionSchema` (e.g. add `craft`/`smelt`/`equip`/`place` to the enum, with `target` carrying item name / count / block) OR feed `toolRegistry` to the prompt. Keep the enum closed/validated (LLM-02 / D-10 still hold — the LLM picks high-level action + target, never raw physical params).
2. Map those decisions → skill dispatch in `nodes.ts` `execute`, building physical params (item, count, block) from the high-level `target`. Reuse the existing `SkillResult`/grounding/memory path (the execute node already records `outcome`/`observed` — no new grounding needed).
3. Add coverage proving the agent-level path: given an LLM decision `action: 'craft'`, the execute node dispatches `skillRegistry.craft` with correct params and records grounded memory.

**OUT OF SCOPE (stays Phase 10 — do NOT plan here):** tech-tree DAG, needs-driven prioritization, recursive progression madeira→pedra→ferro. Phase 9 gap-closure only makes the verbs *reachable* when the LLM chooses them; deciding *when/what* to craft intelligently is Phase 10's declared goal. The gap plan must not implement prioritization logic.

**Live verification deferred (non-blocking, carried forward):** timeout false-negative on a lagged server (G truth #1) and full smelt cycle on a real furnace (truth #2) — see "Human Verification Required" above.

---

_Verified: 2026-06-21 (initial: passed at capability layer)_
_Re-reviewed: 2026-06-21 — behavioral integration gap G-01 recorded for gap closure_
_Verifier: Claude (gsd-verifier) / re-review: Claude_
