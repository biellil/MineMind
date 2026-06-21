---
phase: 09-placement-crafting-smelting-grounded
plan: 03
subsystem: skills (crafting/smelting chain) + registry wiring
tags: [crafting, smelting, station, poi, grounding, registry, tdd]
requires:
  - "src/skills/placeBlock.ts (placeBlockSafe/getRefAndFace — Plano 01)"
  - "src/grounding/evaluate.ts (evaluateCraft/evaluateSmelt — Plano 01)"
  - "src/grounding/capture.ts (captureGroundState)"
  - "src/memory/places.ts (upsertPlace) + persistence.ts (PlaceType 'station' — Plano 01)"
  - "src/skills/equip.ts (equip/equipTool/EquipSchema/selectToolFor — Plano 04)"
  - "src/skills/executor.ts (executeWithSafety)"
  - "src/config.ts (gatherSearchRadius, navigateTimeoutMs, smeltUpdateTimeoutMs)"
provides:
  - "ensureStation(bot, type, signal?) — helper compartilhado: findBlock → navigate adjacente → fallback placeBlockSafe + POI 'station' best-effort + re-validação"
  - "craft(itemName, count) + CraftSchema + craftTool — resolução 2x2→bancada, gate de mesa (no_effect sem throw), grounded por delta (D-18)"
  - "smelt(oreName, count) + SmeltSchema + smeltTool — funde 1 item/chamada, close() obrigatório no finally, grounded por delta (D-20)"
  - "skillRegistry + toolRegistry com placeBlock/craft/smelt/equip (4 skills novas registradas)"
  - "bot.mineMindDb — handle do DB durável exposto no bot para o POI 'station' best-effort"
  - "seam de injeção __stationDeps/__craftDeps/__smeltDeps — testabilidade sem mock.module global"
affects:
  - "src/skills/index.ts (registro)"
  - "src/bot/index.ts (bot.mineMindDb)"
  - "src/skills/schemas.test.ts (7→11 skills/tools)"
tech-stack:
  added: []
  patterns:
    - "ensureStation: POI 'station' é CACHE — sempre re-validar com findBlock antes de confiar (D-13); registro best-effort try/catch nunca bloqueia a estação"
    - "Gate de mesa (D-15 #3): no_effect retornado ANTES de bot.craft — evita o throw 'Recipe requires craftingTable' (Pitfall 4)"
    - "smelt 1 item/chamada com close() no finally (Pitfall 3) — verdade do produto via outputItem()/takeOutput(), nunca progress/fuel (D-10)"
    - "Seam de injeção de dependência (objeto __deps exportado) em vez de mock.module — bun vaza mock.module globalmente entre arquivos de teste"
key-files:
  created:
    - "src/skills/station.ts"
    - "src/skills/station.test.ts"
    - "src/skills/craft.ts"
    - "src/skills/craft.test.ts"
    - "src/skills/smelt.ts"
    - "src/skills/smelt.test.ts"
  modified:
    - "src/skills/index.ts"
    - "src/skills/schemas.test.ts"
    - "src/bot/index.ts"
decisions:
  - "POI 'station' best-effort via bot.mineMindDb: skills só recebem `bot`, então o handle do DB durável é anexado ao bot em bot/index.ts (onBotReady); ensureStation lê (bot as any).mineMindDb num try/catch — POI é cache, não verdade (D-13), nunca bloqueia a estação"
  - "Seam de injeção (__stationDeps/__craftDeps/__smeltDeps) em vez de mock.module: bun vaza mock.module globalmente entre arquivos, quebrando station.test quando craft/smelt rodam juntos; injeção via objeto exportado é a convenção do projeto (deliberation.test.ts)"
  - "craft usa navigateTimeoutMs como teto do executeWithSafety (craft é rápido mas ensureStation pode navegar) — sem campo de config novo"
  - "smelt repõe 1 unidade de combustível por chamada (1 item/chamada → 1 unidade basta); preferência charcoal>coal>planks por densidade (D-09)"
metrics:
  duration_min: 13
  tasks: 3
  files: 9
  tests_added: 17
  completed: 2026-06-21
---

# Phase 9 Plan 3: Crafting/Smelting Chain Grounded + Registry Summary

Cadeia de crafting/smelting grounded entregue e as 4 skills da Fase 9 ligadas ao loop. `ensureStation`
(helper compartilhado) localiza/navega/posiciona estações e as registra como POI `'station'`;
`craft(itemName,count)` resolve a receita (2x2→bancada) com gate de mesa que evita o throw do mineflayer;
`smelt(oreName,count)` funde 1 item por chamada com `close()` garantido. `placeBlock`/`craft`/`smelt`/
`equip` agora vivem no `skillRegistry`+`toolRegistry` (BUILD-01 fechado). Tudo grounded por delta de
inventário (CRAFT-01..03).

## What Was Built

### Task 1 — `src/skills/station.ts` (+ test, TDD)
- **`ensureStation(bot, type, signal?)`** (D-12): (1) nome→id do BLOCO via `registry.blocksByName`
  (Pitfall 5); (2) `findBlock` no raio `config.gatherSearchRadius` (16); (3) achou → navega adjacente
  com `GoalNear` range 2 (bounds 999.1 herdados; timeout/noPath segue e re-valida); (4) não achou →
  fallback: planta a estação adjacente via `placeBlockSafe` (deixa plantada, NÃO recolhe) e re-valida
  com `findBlock` raio 4; (5) registra POI `'station'` best-effort; (6) retorna o Block (ou null).
- **D-13 (comentário-chave):** o POI `'station'` é CACHE, não verdade — sempre re-validar com
  `findBlock` antes de confiar. O registro do POI é `try/catch` e nunca bloqueia a estação.

### Task 2 — `src/skills/craft.ts` (+ test, TDD)
- **`craft(bot, rawParams)` + `CraftSchema` + `craftTool`** (D-15): (1) `recipesFor(id, null, count, null)`
  = receitas 2x2 executáveis sem mesa; (2) se vazio, `ensureStation('crafting_table')` e re-resolve com
  a bancada; (3) **gate D-15 #3 (Pitfall 4):** sem receita → `no_effect` ANTES de `bot.craft` (não deixa
  lançar "Recipe requires craftingTable"); (4) executa embrulhado em `executeWithSafety`, grounded por
  `evaluateCraft` com `expected = recipe.result.count * count` (D-18).

### Task 3 — `src/skills/smelt.ts` (+ test, TDD) + registro em `index.ts`
- **`smelt(bot, rawParams)` + `SmeltSchema` + `smeltTool`** (D-06..D-11/D-20): localiza fornalha via
  `ensureStation('furnace')` (sem fornalha → `no_effect`), abre a window (1 por vez, D-08), repõe
  combustível por densidade se preciso (charcoal>coal>planks, D-09), funde 1 item (`putInput` count 1),
  espera o output via `waitForOutput` (evento `'update'` + `outputItem()`, D-10), recupera com
  `takeOutput()`, e **fecha a window no `finally` (Pitfall 3 — `close()` SEMPRE, inclusive em erro/abort)**.
  Grounded por `evaluateSmelt` (expected 1 por item; o loop cede entre itens via actionFinished).
- **`src/skills/index.ts`**: imports + re-exports + `skillRegistry` (placeBlock/craft/smelt/equip) +
  `toolRegistry` (placeBlockTool/craftTool/smeltTool/equipTool) + `export { ensureStation }`. Agora
  11 skills/11 tools (BUILD-01: placeBlock chamável pelo loop).
- **`src/bot/index.ts`**: `bot.mineMindDb = db` em `onBotReady` — expõe o handle durável para o POI.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Acesso ao DB para o POI 'station' via `bot.mineMindDb`**
- **Found during:** Task 1 (read_first: investigar como ensureStation obtém o Database)
- **Issue:** As skills recebem só `bot`; o handle durável vive em `holder.db` (não em `bot`). O plano
  pediu para investigar e, se o acesso não fosse fácil, deixar o POI best-effort.
- **Fix:** Anexado `bot.mineMindDb = db` em `bot/index.ts` (`onBotReady`); `ensureStation` lê
  `(bot as any).mineMindDb` num try/catch. Não abre um segundo handle de DB (reusa o do boot). O POI
  é cache (D-13) — degrada silenciosamente se o handle estiver ausente (testes/boot parcial).
- **Files modified:** src/bot/index.ts, src/skills/station.ts
- **Commit:** c433707

**2. [Rule 1 - Bug] `mock.module` vaza global entre arquivos de teste (bun)**
- **Found during:** Task 3 (full `bun test` suite — 6 station tests falharam só quando rodando junto)
- **Issue:** `craft.test.ts`/`smelt.test.ts` usavam `mock.module('./station', ...)`, que substitui o
  módulo `./station` GLOBALMENTE no bun; quando todos os arquivos rodam juntos, `station.test.ts`
  importava o `ensureStation` mockado (stub) em vez do real, e seus mocks de `./placeBlock`/places
  eram clobberados. Passavam isolados, falhavam em conjunto.
- **Fix:** Trocado `mock.module` por **seam de injeção de dependência** (`__stationDeps`/`__craftDeps`/
  `__smeltDeps` — objetos exportados com defaults reais; testes sobrescrevem em `beforeEach` e
  restauram em `afterEach`). É a convenção já usada no projeto (deliberation.test.ts injeta o provider).
- **Files modified:** src/skills/station.ts, craft.ts, smelt.ts + os 3 testes
- **Commit:** c433707

**3. [Rule 1 - Bug] `schemas.test.ts` desatualizado (7→11 skills)**
- **Found during:** Task 3 (full suite — 3 asserções "contém as 7 skills/tools" falharam)
- **Issue:** Registrar as 4 skills novas mudou `skillRegistry`/`toolRegistry` de 7 para 11 entradas;
  os testes existentes assertavam exatamente 7.
- **Fix:** Atualizado `schemas.test.ts` para esperar 11 skills/tools com os nomes novos.
- **Files modified:** src/skills/schemas.test.ts
- **Commit:** c433707

## Verification

- `bun test src/skills/station.test.ts src/skills/craft.test.ts src/skills/smelt.test.ts` → 17 pass, 0 fail.
- Registro: `import('./src/skills/index.ts')` confirma os 4 (placeBlock/craft/smelt/equip) no
  `skillRegistry` e imprime `registry ok; tools= 11`.
- `bun test` global → 420 pass, 1 skip, 0 fail (sem regressões; a linha `[recordEvent] ... no such
  table: events` é log esperado de um teste de degradação, não falha).
- `bunx tsc --noEmit` → exit 0.
- craft no caminho sem mesa retorna `no_effect` com `bot.craft` NÃO chamado (Pitfall 4 evitado, spy 0).
- smelt fecha a window no `finally` inclusive quando `putInput` lança (Pitfall 3 verificado).

## Self-Check: PASSED
