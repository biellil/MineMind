---
phase: 09-placement-crafting-smelting-grounded
verified: 2026-06-21T00:00:00Z
status: passed
score: 14/14 must-haves verified (13 capability + G-01 behavioral closure)
re_verification:
  previous_status: gaps_found
  previous_score: 13/13 capability; 1 behavioral gap (G-01)
  gaps_closed:
    - "G-01: craft/smelt/equip/placeBlock agora alcançáveis a partir da decisão do agente (enum LLM + dispatch no execute node)"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Falso-negativo do timeout ao vivo (servidor lagado)"
    expected: "placeBlock reporta 'success' quando o bloco realmente apareceu, mesmo com timeout de blockUpdate"
    why_human: "Requer servidor real com lag; unit test cobre o caminho com mock"
  - test: "Ciclo completo de smelt ao vivo (iron_ore + charcoal em fornalha real)"
    expected: "iron_ingot no inventário, fornalha fechada, sem travar o loop ~10s"
    why_human: "Timing assíncrono real da fornalha; unit test usa EventEmitter mock"
---

# Phase 9: Placement + Crafting/Smelting Grounded Verification Report

**Phase Goal:** O agente posiciona blocos de forma confiável e crafta/funde/equipa itens com verificação grounded — o primitivo `placeBlock` robusto é implementado uma vez (compartilhado por abrigo, building e estações) e a cadeia tábuas→bancada→ferramenta→fornalha→ferro produz resultados verídicos confirmados pelo inventário. Além disso (gap G-01), as 4 skills (placeBlock/craft/smelt/equip) devem ser alcançáveis a partir da decisão do agente (LLM action enum + dispatch no execute node).
**Verified:** 2026-06-21
**Status:** passed
**Re-verification:** Yes — after G-01 gap closure (plan 09-05)

## Re-Verification Summary

A verificação anterior aprovou 13/13 verdades de CAPACIDADE mas registrou **G-01** (gap de integração comportamental): as 4 skills estavam construídas/grounded/registradas mas o enum de ação do LLM era fechado em `['gather','explore','navigate','idle','chat']` e o execute node só despachava `dig`/`navigate` — o agente nunca podia ESCOLHER craftar/fundir/equipar/colocar. O plano 09-05 (gap-closure) abriu a superfície de decisão e fiou os verbos ao dispatch. **G-01 está fechado** (verificado em código + teste). Nenhuma regressão nos 13 itens de capacidade.

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                                                           | Status     | Evidence                                                                                                                              |
| --- | ----------------------------------------------------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 1   | placeBlock confiável: outcome de `bot.blockAt(alvo)`, engole timeout `blockUpdate` como falso-negativo, equipa item, face correta | ✓ VERIFIED | (regressão) placeBlock.ts grounded por blockAt; FALSE_NEGATIVE/GENUINE_FAIL preservados                                              |
| 2   | getRefAndFace puro: ref sólido + face exposta, faceVector correto                                                               | ✓ VERIFIED | (regressão) função pura, FACES preferência face de baixo, null se cercado                                                            |
| 3   | placeBlock implementado UMA VEZ — shelter consome placeBlockSafe/getRefAndFace, 0 chamadas cruas                               | ✓ VERIFIED | (regressão) shelter.ts importa placeBlockSafe; grep `bot.placeBlock(` ativo = 0                                                      |
| 4   | craft grounded por delta; gate de mesa retorna no_effect SEM deixar bot.craft lançar                                           | ✓ VERIFIED | (regressão) craft.ts gate antes do bot.craft; evaluateCraft                                                                          |
| 5   | ensureStation localiza/navega/posiciona + registra POI 'station', re-valida por findBlock                                      | ✓ VERIFIED | (regressão) station.ts find→navigate→place→re-findBlock + upsertPlace                                                                |
| 6   | smelt funde 1 item por chamada, close() obrigatório no finally, grounded por delta do produto                                 | ✓ VERIFIED | (regressão) smelt.ts close() no finally; outputItem truth                                                                            |
| 7   | equip standalone grounded por estado LOCAL (heldItem/slot), selectToolFor binário sem ranking de tier                         | ✓ VERIFIED | (regressão) equip.ts local grounding; selectToolFor `.find` sem tier                                                                 |
| 8   | dig/attack fazem pré-flight selectToolFor antes de agir (best-effort)                                                          | ✓ VERIFIED | (regressão) dig.ts/attack.ts selectToolFor em try/catch                                                                              |
| 9   | evaluateCraft/Smelt classificam por delta do item-alvo; evaluateEquip por estado local                                        | ✓ VERIFIED | (regressão) evaluate.ts 3 funções puras                                                                                              |
| 10  | PlaceType aceita 'station'; 4 timeouts em config com validação                                                                 | ✓ VERIFIED | (regressão) union contém 'station'; config carrega 6000/12000/15000/0                                                                |
| 11  | As 4 skills registradas em skillRegistry + toolRegistry                                                                        | ✓ VERIFIED | index.ts:52-64 skillRegistry; :71-83 toolRegistry (11 tools)                                                                         |
| 12  | Testes da Fase 7/8 (shelter/dig/attack) continuam verdes após refator                                                          | ✓ VERIFIED | suite global 432 pass / 0 fail / 1 skip                                                                                              |
| 13  | Cadeia tábuas→bancada→ferramenta→fornalha→ferro produz resultado verídico confirmado pelo inventário                          | ✓ VERIFIED | (regressão) craft+ensureStation+smelt+equip wiring completo e tipado                                                                 |
| 14  | **G-01 fechado:** as 4 skills alcançáveis a partir da decisão do agente (enum LLM action + dispatch no execute node)          | ✓ VERIFIED | schemas.ts:27 enum estende craft/smelt/equip/place (FECHADO); nodes.ts:73-77 → 'building'; nodes.ts:233-266 dispatch monta params; nodes.test.ts 8 testes verdes |

**Score:** 14/14 truths verified

### G-01 Closure Detail (focus of re-verification)

| Sub-claim (must_have 09-05)                                                                 | Status     | Evidence (code-verified)                                                                                                  |
| ------------------------------------------------------------------------------------------ | ---------- | ----------------------------------------------------------------------------------------------------------------------- |
| Enum aceita craft/smelt/equip/place e rejeita fora do enum (continua FECHADO — LLM-02/D-10) | ✓ VERIFIED | schemas.ts:26-35 `z.enum([...,'craft','smelt','equip','place'])`; target permanece `z.string().max(64).optional()` (:37-48) |
| action='craft' → despacha skillRegistry.craft com {itemName, count} derivados do target     | ✓ VERIFIED | nodes.ts:239-244 parse `item:N`, count clampado 1-64; teste "craft dispatch" verde (itemName/count assertados)            |
| action='smelt' → despacha skillRegistry.smelt com {oreName, count}                           | ✓ VERIFIED | nodes.ts:245-249; teste "smelt dispatch" verde                                                                            |
| action='equip' → despacha skillRegistry.equip com {itemName, destination?}                   | ✓ VERIFIED | nodes.ts:250-255 parse `item@slot`; testes equip (com/sem slot) verdes                                                    |
| action='place' → despacha skillRegistry.placeBlock com {target:{x,y,z}, itemName}           | ✓ VERIFIED | nodes.ts:256-265 parse `nome @ x,y,z` (chave 'placeBlock', não 'place'); teste "place dispatch" verde                     |
| MemEvent grounded deriva do SkillResult (no_effect/observed=0 → result=failure)             | ✓ VERIFIED | caminho de grounding reusado (nodes.ts:336-360); teste "grounded memory" verde                                            |
| Target inválido degrada para sem-ação SEM lançar (Core Value: o tick continua)             | ✓ VERIFIED | nodes.ts:256-265 place sem posição não seta skill; nodes.ts:269-275 emit actionFinished skill:null; teste "place sem posição" verde |
| Nenhuma lógica tech-tree/needs no dispatch (boundary Phase 10 intacto)                       | ✓ VERIFIED | grep em nodes.ts: `needs` só no pipeline `observe` (Fase 2), 0 ocorrências no branch building de execute                  |

### Required Artifacts

| Artifact                       | Expected                                                  | Status     | Details                                                  |
| ------------------------------ | -------------------------------------------------------- | ---------- | -------------------------------------------------------- |
| `src/llm/schemas.ts`           | enum action estendido com craft/smelt/equip/place (FECHADO)| ✓ VERIFIED | Exists, substantive; enum fechado, target string; tsc 0 |
| `src/cognition/nodes.ts`       | actionToCognitiveState + branch dispatch 'building'      | ✓ VERIFIED | Exists, substantive, wired a skillRegistry               |
| `src/cognition/nodes.test.ts`  | cobertura agent-level do dispatch dos 4 verbos           | ✓ VERIFIED | Exists; 8 testes verdes (4 verbos + grounded + degrade)  |
| `src/skills/placeBlock.ts`     | placeBlockSafe + getRefAndFace + schema + tool           | ✓ VERIFIED | (regressão) wired (shelter/station/index/nodes)          |
| `src/grounding/evaluate.ts`    | evaluateCraft/Smelt/Equip                                | ✓ VERIFIED | (regressão) 3 funções puras                              |
| `src/skills/{craft,smelt,equip,station}.ts` | cadeia grounded + ensureStation              | ✓ VERIFIED | (regressão) grounded por delta/local; POI 'station'      |
| `src/skills/index.ts`          | registro das 4 skills                                    | ✓ VERIFIED | skillRegistry + toolRegistry (11 tools)                  |

### Key Link Verification

| From                       | To                                | Via                                          | Status  |
| -------------------------- | --------------------------------- | -------------------------------------------- | ------- |
| schemas.ts (action enum)   | nodes.ts actionToCognitiveState   | `case 'craft'/'smelt'/'equip'/'place'`       | ✓ WIRED |
| nodes.ts execute (building)| skillRegistry.craft/smelt/equip/placeBlock | `skillRegistry[skill!]!(bot, params)` | ✓ WIRED |
| nodes.ts execute           | grounding/memória (recordEvent)   | result.outcome → MemEvent grounded (reusado) | ✓ WIRED |
| nodes.test.ts              | skillRegistry                     | monkeypatch pontual + assert params          | ✓ WIRED |
| shelter.ts / station.ts    | placeBlock.ts                     | placeBlockSafe (regressão)                   | ✓ WIRED |

### Data-Flow Trace (Level 4)

| Artifact        | Data Variable        | Source                                  | Produces Real Data | Status     |
| --------------- | -------------------- | --------------------------------------- | ------------------ | ---------- |
| nodes.execute   | params (físicos)     | `JSON.parse(target)` do `llmTarget` do LLM | Yes (decisão LLM)  | ✓ FLOWING  |
| nodes.execute   | MemEvent outcome     | `result.outcome` do SkillResult         | Yes (world/inv truth) | ✓ FLOWING  |
| craft/smelt     | observed             | `inventoryDelta` / `furnace.outputItem`  | Yes (real delta)   | ✓ FLOWING  |
| placeBlock      | outcome              | `bot.blockAt(targetPos)` pós-ação       | Yes (world truth)  | ✓ FLOWING  |

A memória continua derivando do estado observado (delta de inventário / blockAt / heldItem), nunca da resolução da Promise — a garantia anti-"peguei 10 tábuas" (D-09 B) é preservada e agora alcançada pelo caminho do agente.

### Behavioral Spot-Checks

| Behavior                                  | Command                                              | Result                          | Status |
| ----------------------------------------- | ---------------------------------------------------- | ------------------------------- | ------ |
| Dispatch agent-level dos 4 verbos + memória | `bun test src/cognition/nodes.test.ts`              | 8 pass / 0 fail                 | ✓ PASS |
| Enum estendido + ainda fechado            | `bun test src/llm/schemas.test.ts`                   | 19 pass / 0 fail                | ✓ PASS |
| No regression na suite global             | `bun test`                                           | 432 pass / 0 fail / 1 skip      | ✓ PASS |
| TypeScript compila                        | `bunx tsc --noEmit`                                  | exit 0                          | ✓ PASS |
| Sem lógica tech-tree/needs no dispatch    | grep `needs/tech-tree` no branch building de nodes.ts| 0 ocorrências                   | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan(s)        | Description                                                         | Status      | Evidence                                                  |
| ----------- | --------------------- | ------------------------------------------------------------------ | ----------- | --------------------------------------------------------- |
| BUILD-01    | 01, 02, 03, **05**    | Coloca blocos de forma confiável (placeBlock + verificação/timeout)| ✓ SATISFIED | placeBlockSafe grounded + agora alcançável via action='place' → dispatch |
| CRAFT-01    | 03, **05**            | Crafta verificando inventário antes/depois (grounded)              | ✓ SATISFIED | craft grounded + alcançável via action='craft' → dispatch |
| CRAFT-02    | 03, **05**            | Posiciona e usa bancada quando a receita exige (3x3)               | ✓ SATISFIED | ensureStation + craft alcançável pelo agente              |
| CRAFT-03    | 03, **05**            | Funde minérios na fornalha e recupera o resultado                  | ✓ SATISFIED | smelt grounded + alcançável via action='smelt' → dispatch |
| CRAFT-04    | 04, **05**            | Equipa a ferramenta/armadura apropriada do inventário              | ✓ SATISFIED | equip + selectToolFor; alcançável via action='equip' → dispatch |

Os 5 IDs declarados estão contabilizados em REQUIREMENTS.md (todos `[x]` + tabela de mapeamento Phase 9/Complete). Nenhum ORPHANED. O plano 09-05 reforça os 4 requisitos comportamentais (CRAFT-01/02/03 + BUILD-01) ao nível agente; CRAFT-04 já era alcançável via dig/attack pre-flight e agora também como verbo standalone.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| (none) | — | Nenhum TODO/FIXME/placeholder/stub nos arquivos do gap-closure (schemas.ts/nodes.ts/nodes.test.ts) | — | — |

**Note (intencional, não-gap):** `config.placeRetries` default 0 e o corpo do retry em placeBlockSafe deliberadamente NÃO implementado (D-04, tracked, gated em teste ao vivo). O guard de idempotência ESTÁ presente. Não conta contra o goal.

### Human Verification Required

Não-bloqueante (carregado da verificação inicial — comportamento de servidor ao vivo, coberto por mocks):

1. **Falso-negativo do timeout ao vivo** — em servidor lagado, forçar timeout de blockUpdate; placeBlock deve reportar 'success' se o bloco apareceu. Requer servidor real.
2. **Ciclo completo de smelt ao vivo** — fundir iron_ore com charcoal em fornalha real; iron_ingot no inventário, fornalha fechada, sem travar ~10s. Timing assíncrono real.

### Gaps Summary

**Nenhum gap restante.** A camada de capacidade (13 verdades) passou na verificação inicial e não regrediu. O único gap registrado (G-01 — integração comportamental) foi fechado pelo plano 09-05: o enum de ação do LLM foi estendido (mantido FECHADO, LLM-02/D-10), os 4 verbos foram fiados ao dispatch do execute node com montagem de params físicos a partir do target de alto nível, e o caminho de grounding/memória existente foi reusado sem alteração. O teste agent-level (`nodes.test.ts`, 8 testes) prova o despacho correto de cada verbo, a derivação grounded da memória (no_effect→failure) e a degradação segura para sem-ação quando o target é inválido. Boundary da Phase 10 (tech-tree/needs/priorização) respeitado e verificado por grep. Suite global 432 pass / 0 fail / 1 skip; tsc exit 0.

As duas verificações humanas remanescentes são live-server smoke tests (não-bloqueantes), inerentes ao timing de servidor real e já cobertas por unit tests com mock.

---

_Verificação inicial: 2026-06-21 (passed na camada de capacidade)_
_Re-review: 2026-06-21 — G-01 registrado para gap closure_
_Re-verificação (pós 09-05): 2026-06-21 — G-01 FECHADO, status: passed_
_Verifier: Claude (gsd-verifier)_
