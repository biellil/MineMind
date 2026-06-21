# Phase 9: Placement + Crafting/Smelting Grounded - Research

**Researched:** 2026-06-21
**Domain:** mineflayer block placement, crafting, furnace/smelting, equip — grounded by inventory/world delta
**Confidence:** HIGH (API verified against mineflayer 4.37.1 source + docs; codebase signatures read directly)

## Summary

Fase 9 implementa o primitivo `placeBlock` robusto **uma vez** e torna `craft`/`smelt`/`equip` **grounded**. As 20 decisões (D-01..D-20) já estão travadas; este RESEARCH **aterra os detalhes de API/timing** que tornam cada decisão implementável corretamente. Todos os pontos críticos foram confirmados na fonte do mineflayer 4.37.1 (não em memória de treino):

- **placeBlock**: NÃO equipa sozinho (D-02 confirmado); o erro de falso-negativo é **`Event blockUpdate:<pos> did not fire within timeout of 5000ms`** (lançado por `onceWithCleanup`), distinto da falha genuína **`No block has been placed : the block is still <name>`** (lançada no pós-check de tipo). `onceWithCleanup` limpa o listener via `.finally()` em TODOS os caminhos (sem leak — D-03 confirmado).
- **craft**: `bot.craft(recipe, count, table)` **lança** `Recipe requires craftingTable, but one was not supplied: ...` se `requiresTable` e nenhuma mesa — logo o gate D-15 #3 (`no_effect` antes de chamar) é necessário. `requiresTable` é computado pela receita (shape > 2x2 ou >4 slots).
- **furnace**: ciclo `openFurnace → putFuel/putInput → 'update' → takeOutput → close()`. `furnace.progress`/`fuel` são 0..1 (só dizem *quando* checar); a verdade é `outputItem()`/o `Item` de `takeOutput()` (D-10). `close()` obrigatório (1 window por vez — D-08).
- **equip**: destinos `'hand'|'head'|'torso'|'legs'|'feet'|'off-hand'`; não muda contagem de inventário → grounding LOCAL (D-19), análogo ao `bot.food` do `eat.ts`.
- **fuel**: coal/charcoal **8 itens**, blaze rod **12**, log **1.5**, coal block **80**, lava bucket **100**; **10s (200 ticks) por item** — confirmado na wiki.

**Primary recommendation:** Criar `src/skills/placeBlock.ts` com o par `placeBlockSafe` (wrapper grounded com swallow seletivo do erro de timeout + verificação `blockAt`) e `getRefAndFace` (helper puro, testável). Refatorar `shelter.ts` para consumi-lo em commit isolado. `craft`/`smelt`/`equip` seguem o molde de `dig.ts` (delta de inventário) ou `eat.ts` (estado LOCAL), reusando `captureGroundState`/`inventoryDelta`/`executeWithSafety`.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions (D-01..D-20 — NÃO re-litigar)

**placeBlock + refator shelter (BUILD-01):**
- **D-01:** Novo `src/skills/placeBlock.ts` — `(bot, params) ⇒ Promise<SkillResult>` auto-embrulhado em `executeWithSafety`. Núcleo = **A (wrapper grounded com swallow seletivo)** + **C (helper `getRefAndFace` puro/testável)**. Outcome deriva de `bot.blockAt(alvo)` pós-ação, NUNCA da Promise (GRND-01).
- **D-02:** O wrapper equipa o bloco na mão **antes** de colocar.
- **D-03:** NÃO adicionar listeners manuais de `blockUpdate` (mineflayer usa `onceWithCleanup` interno — sem leak).
- **D-04:** Retry (B) **atrás de flag** — 2-3 tentativas com re-`lookAt`+re-`equip`, idempotente (não recolocar se alvo já preenchido), degradando p/ `partial`/`no_effect` limpo.
- **D-05:** Refatorar `src/skills/shelter.ts` AGORA p/ consumir o wrapper, em **commit isolado**, mantendo os dois branches (cavar-e-tampar / pilar 1×1) e revalidando os testes do shelter da Fase 7/8.

**Smelting (CRAFT-03):**
- **D-06:** Modelo **D — por item, loop cede entre itens**. Ciclo: `openFurnace` → fuel (se preciso)+input → funde 1 item → `takeOutput` → `furnace.close()` → retorna `actionFinished`. Re-roda a skill no próximo tick se ainda há input.
- **D-07:** Sem estado persistente novo — a pendência É o input restante na fornalha (regroundável reabrindo).
- **D-08:** `furnace.close()` obrigatório no fim e no abort (1 window por vez).
- **D-09:** Combustível por densidade: charcoal → coal (8 cada; preferir charcoal renovável) → planks (1.5, descartável p/ 1-2 itens). `putFuel count = ceil(restante / itensPorUnidade)`.
- **D-10:** Esperar via evento `'update'` com timeout+AbortSignal; verdade = `outputItem()`/`takeOutput()`, NUNCA `progress`/`fuel`.
- **D-11:** Trade-off aceito: ~10s não-preemptável DURANTE cada item (preempção ENTRE itens).

**Estação (CRAFT-02):**
- **D-12:** `ensureStation(tipo)` → (1) `bot.findBlock({matching, maxDistance: config.gatherSearchRadius})`; (2) navega adjacente (`GoalNear`, bounds 999.1); (3) fallback: `placeBlock` robusto, deixando plantada (NÃO recolher).
- **D-13:** Registrar estação como POI `'station'` via `upsertPlace`. POI é cache, não verdade — re-validar com `findBlock` antes de confiar.
- **D-14:** Adicionar `'station'` ao union `PlaceType` (`src/memory/persistence.ts`).

**Craft + equip (CRAFT-01, CRAFT-04):**
- **D-15:** Skill `craft(itemName, count)` — resolve receita internamente: (1) `recipesFor(id, null, count, null)` → 2x2; (2) se vazio, re-resolve com bancada via `ensureStation`; (3) se `requiresTable` sem bancada → `no_effect` (NÃO deixar `bot.craft` lançar); (4) `bot.craft(recipe, count, bancadaBlock)`. Recursão de pré-requisitos fica atrás do mesmo nome de item (Fase 10 sem mudar assinatura).
- **D-16:** `equip` = **B1** (`equip(itemName, destination?)` standalone no skillRegistry) **+ B2** (pré-flight `selectToolFor` em `dig`/`attack`).
- **D-17:** "Apropriado" = **heurística binária por categoria** (tem pickaxe? equipa; sword/axe? equipa) via `bot.inventory.items().find(matchesCategory)`. SEM ranking por tier (Fase 10).

**Grounding:**
- **D-18:** `craft` → delta de inventário (idêntico ao `dig`). `expected = recipe.result.count * count`; `observed` = ganho real. `success`/`partial`/`no_effect`/`error`.
- **D-19:** `equip` → grounding LOCAL (não delta de inventário). `observed = (bot.heldItem?.name === alvo ? 1 : 0)` ou checar slot de armadura. `delta: {}`.
- **D-20:** `smelt` → delta de inventário do item fundido após `takeOutput`/reabertura + consumo de input/fuel.

### Claude's Discretion
- Nomes exatos de arquivos/helpers (`placeBlock.ts`, `ensureStation`, `getRefAndFace`, `selectToolFor`) e organização interna.
- Forma exata do schema Zod de cada skill; valores de timeout/nº de tentativas do retry (D-04); predicado fino de "face exposta/alcançável" (D-01 C).
- Mecânica fina da espera do `'update'` da fornalha e do flag/sinal de "continuar fundindo" (D-06).
- Heurística exata de `matchesCategory` (D-17), sem ranking por tier.
- Como o execute node sinaliza "re-rodar smelt" entre itens (reusar `actionFinished`/outcome `partial`).

### Deferred Ideas (OUT OF SCOPE)
- Camada de revisita / "tarefa pendente" persistente p/ smelting de lotes grandes → diferida.
- Retry sempre-ligado no placeBlock → atrás de flag (D-04).
- Seleção de ferramenta por tier de mineração → **Fase 10**.
- Resolução recursiva de pré-requisitos / tech-tree DAG → **Fase 10**.
- Place-and-pickup de estação → rejeitado como política padrão.
- Building deliberado / abrigo planejado → **Fase 12**.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BUILD-01 | Coloca blocos de forma confiável (placeBlock c/ verificação e timeout) | `bot.placeBlock(ref, faceVector)` confirmado; erro de timeout `Event blockUpdate:<pos> did not fire within timeout of 5000ms` (falso-negativo) vs `No block has been placed : the block is still <name>` (falha real); equip-antes obrigatório; `getRefAndFace` (escolha de ref+face exposta). Issue #2757 confirma o race em server lagado. |
| CRAFT-01 | Crafta verificando inventário antes/depois (grounded) | `recipesFor`/`craft` confirmados; Recipe shape (`result.{id,metadata,count}`, `requiresTable`, `delta`); grounding por delta (molde `evaluateDig`/`captureGroundState`). |
| CRAFT-02 | Posiciona+usa bancada quando exige 3x3 | `requiresTable` computado (shape>2x2); `bot.craft(recipe, count, tableBlock)` lança se requiresTable sem table → gate D-15 #3; `findBlock`/`GoalNear`/`placeBlock` p/ `ensureStation`; POI `'station'`. |
| CRAFT-03 | Funde minérios na fornalha e recupera o resultado | `openFurnace`/`putFuel`/`putInput`/`takeOutput`/`'update'`/`close()` confirmados; ciclo assíncrono por item; fuel 8/item (coal/charcoal), 10s/item. |
| CRAFT-04 | Equipa ferramenta/armadura apropriada | `bot.equip(item, dest)` destinos confirmados; equip não muda contagem → grounding LOCAL (D-19) via `bot.heldItem`/`inventory.slots[5..8]`. |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Commits:** Conventional Commits **com emoji** (ex.: `✨ feat(skills): ...`, `♻️ refactor(shelter): ...`). NUNCA incluir "Generated with Claude Code" nem "Co-Authored-By".
- **Workflow GSD:** edições só dentro de um comando GSD (esta fase roda via `/gsd:execute-phase`).
- **Stack travado:** TypeScript ponta-a-ponta, runtime **Bun** (`bun:sqlite`, `bun test`), mineflayer **4.37.1**, Zod **4.4.3**. NÃO usar `mineflayer-pvp`/`mineflayer-auto-eat` (banidos — usar API nativa). Skill library de código LLM-gerado é OUT OF SCOPE.
- **Idioma:** comentários/docs em pt-BR (padrão do código existente).

## Standard Stack

### Core (já instalado — nenhuma dependência nova nesta fase)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| mineflayer | 4.37.1 | placeBlock/craft/openFurnace/equip nativos | API de alto nível padrão de facto; tudo nativo (sem plugin novo) |
| mineflayer-pathfinder | 2.4.5 | `GoalNear`/`GoalGetToBlock` p/ navegar até a estação (D-12) | Já usado em `dig.ts`; herda bounds 999.1 |
| prismarine-recipe | (transitivo via mineflayer) | `Recipe` shape (`result`, `requiresTable`, `delta`) | Resolução de receita; `delta` valida `expected` |
| prismarine-windows | (transitivo) | Furnace window (`close()`, slots) | Ciclo de fornalha |
| zod | 4.4.3 | schema dos params (tool-call serializável) | Padrão do projeto; `.toJSONSchema()` p/ o LLM |

**Nenhuma instalação nova.** Tudo já em `package.json` (confirmado).

> **NÃO usar plugins de crafting/smelting de terceiros.** A lógica determinística (resolver receita, escolher fuel, equipar categoria) é o objeto de estudo do projeto — implementar com API nativa.

## Architecture Patterns

### Estrutura recomendada (segue a convenção existente de `src/skills/`)
```
src/skills/
├── placeBlock.ts   # NOVO — placeBlockSafe (wrapper grounded) + getRefAndFace (helper puro)
├── craft.ts        # NOVO — craft(itemName,count) + ensureStation (helper compartilhado)
├── smelt.ts        # NOVO — smelt por item (loop cede entre itens, D-06)
├── equip.ts        # NOVO — equip(itemName,destination?) + selectToolFor (helper)
├── shelter.ts      # REFATORAR — consome placeBlockSafe (D-05, commit isolado)
├── dig.ts          # EDITAR — pré-flight selectToolFor (B2/D-16)
├── attack.ts       # EDITAR — pré-flight selectToolFor (B2/D-16)
└── index.ts        # EDITAR — registrar placeBlock/craft/smelt/equip no skillRegistry+toolRegistry
src/grounding/
└── evaluate.ts     # EDITAR — evaluateCraft/evaluateSmelt/evaluateEquip (puros, molde evaluateDig)
src/memory/
├── persistence.ts  # EDITAR — PlaceType += 'station' (D-14)
└── places.ts       # (sem mudança de assinatura — upsertPlace já aceita PlaceType)
src/config.ts       # EDITAR — placeTimeoutMs, placeRetries, smeltTimeoutMs, smeltUpdateTimeoutMs
```

### Pattern 1: placeBlockSafe — wrapper grounded com swallow seletivo (D-01 A)
**What:** Equipa o bloco, chama `bot.placeBlock`, captura o throw, distingue timeout (falso-negativo) de falha real, e deriva o outcome de `bot.blockAt(alvo)` pós-ação.
**When to use:** todo posicionamento de bloco (shelter, ensureStation fallback, building futuro).
```typescript
// Padrão (NÃO copiar literal — Claude's discretion sobre nomes/timeouts):
// Erros confirmados na fonte (mineflayer 4.37.1 lib/plugins/place_block.js + promise_utils.js):
const FALSE_NEGATIVE = /did not fire within timeout/   // bloco PODE ter sido colocado
const GENUINE_FAIL   = /No block has been placed/      // bloco NÃO foi colocado

async function placeBlockSafe(bot, ref, faceVector, blockItem, targetPos): Promise<SkillResult> {
  await bot.equip(blockItem, 'hand')          // D-02: placeBlock NÃO equipa sozinho (confirmado)
  let threw: unknown = null
  try {
    await bot.placeBlock(ref, faceVector)      // resolve = sucesso; rejeita = ver abaixo
  } catch (err) {
    threw = err
    // swallow seletivo: timeout é falso-negativo em server lagado — NÃO propaga, verifica por blockAt.
    // "No block has been placed" também NÃO propaga como throw de fluxo (D-12): vira outcome.
  }
  // GRND-01/D-01: a VERDADE é o mundo, nunca a Promise.
  const placed = bot.blockAt(targetPos)
  const ok = placed != null && placed.name !== 'air' && placed.name !== 'cave_air'
  const outcome = ok ? 'success' : (threw && GENUINE_FAIL.test(msg(threw)) ? 'partial' : 'no_effect')
  return { outcome, observed: ok ? 1 : 0, expected: 1, delta: {}, reason: threw ? msg(threw) : undefined }
}
```
**Confirmações de fonte:**
- `bot.placeBlock` **não** equipa (chama `_genericPlace` que espera o item já na mão). → D-02 necessário.
- O throw de timeout vem de `onceWithCleanup(bot, \`blockUpdate:${dest}\`, { timeout: 5000, ... })` → mensagem `Event blockUpdate:<pos> did not fire within timeout of 5000ms`.
- O throw genuíno vem do pós-check: `if (oldBlock?.type === newBlock.type) throw new Error(\`No block has been placed : the block is still ${oldBlock?.name}\`)`.
- `onceWithCleanup` faz `.finally(() => emitter.removeListener(...))` em TODOS os caminhos → **sem leak** (D-03 confirmado).

### Pattern 2: getRefAndFace — helper puro (D-01 C)
**What:** Dado o alvo XYZ, escolhe um vizinho sólido com face exposta ao ar (alcançável) e calcula o `faceVector`.
**When to use:** dentro de placeBlockSafe e do ensureStation.
```typescript
// As 6 faces candidatas; o bloco a colocar aparece em ref.position + faceVector (confirmado nos docs).
const FACES: Array<[number,number,number]> = [
  [0,-1,0],[0,1,0],[-1,0,0],[1,0,0],[0,0,-1],[0,0,1],
]
// Para colocar em alvo P: o ref é P+faceVector (o vizinho), e a face de colocação é -faceVector.
// Escolher um ref que (a) é sólido (placed contra ele) e (b) cuja face apontando p/ P está exposta.
// Preferir face de BAIXO (ref acima do alvo → coloca p/ baixo) p/ tampar teto (caso shelter cavar-e-tampar).
function getRefAndFace(bot, target): { ref: Block; face: Vec3 } | null { /* puro/testável */ }
```
> **Nota:** mineflayer-builder usa o padrão `getFaceAndRef` (escolhe ref+face + faz `lookAt` antes). Adotar o mesmo conceito. `bot.placeBlock` exige `faceVector` como Vec3-like `{x,y,z}` (shelter.ts já passa `{x,y,z} as Vec3` — funciona).

### Pattern 3: craft com resolução de receita + gate de mesa (D-15)
```typescript
async function craft(bot, { itemName, count }): Promise<SkillResult> {
  const before = captureGroundState(bot)
  const id = bot.registry.itemsByName[itemName]?.id     // nome → id (registry, padrão do eat.ts)
  // (1) tenta 2x2 (table=null): recipesFor SÓ retorna receitas executáveis sem mesa quando table=null
  let recipes = bot.recipesFor(id, null, count, null)
  let table = null
  if (recipes.length === 0) {
    // (2) re-resolve COM bancada (recipesAll inclui receitas que exigem mesa)
    table = await ensureStation(bot, 'crafting_table')   // findBlock|navigate|placeBlock fallback
    if (table) recipes = bot.recipesFor(id, null, count, table)
  }
  if (recipes.length === 0) {
    // (3) sem receita executável (falta ingrediente OU exige mesa sem ter) → no_effect (NÃO deixar craft lançar)
    return { outcome: 'no_effect', observed: 0, expected: count, delta: {}, reason: '...' }
  }
  const recipe = recipes[0]
  // recipe.requiresTable && !table já foi coberto acima; bot.craft lançaria
  // "Recipe requires craftingTable, but one was not supplied" (confirmado na fonte).
  let threw = null
  try { await bot.craft(recipe, count, table ?? undefined) } catch (e) { threw = e }
  const after = captureGroundState(bot)
  const expected = recipe.result.count * count       // D-18
  return evaluateCraft(before, after, itemName, expected, threw)  // delta real é a verdade
}
```
**Confirmações:**
- `bot.recipesFor(itemType, metadata, minResultCount, craftingTable)`: com `craftingTable=null` retorna SÓ receitas executáveis sem mesa (filtra por inventário). `metadata=null` casa qualquer.
- `bot.craft(recipe, count, craftingTable)` **lança** `Recipe requires craftingTable, but one was not supplied: <json>` antes de craftar se `recipe.requiresTable` e `craftingTable` ausente → o gate #3 é obrigatório.
- `recipe.result` = `{ id, metadata, count }`. `recipe.requiresTable` = boolean (true se shape > 2x2 ou > 4 slots). `recipe.delta` = array `{id, metadata, count}` (consumidos negativos, resultado positivo) — pode validar `expected` mas a verdade é o delta REAL (D-18/GRND-01).

### Pattern 4: smelt por item — ciclo assíncrono (D-06/D-08/D-10)
```typescript
async function smelt(bot, { oreName, count }): Promise<SkillResult> {
  const before = captureGroundState(bot)
  const furnaceBlock = await ensureStation(bot, 'furnace')
  if (!furnaceBlock) return { outcome:'no_effect', observed:0, expected:count, delta:{}, reason:'sem fornalha' }
  const furnace = await bot.openFurnace(furnaceBlock)   // 1 window por vez (D-08)
  let threw = null
  try {
    // fuel se preciso (D-09): charcoal→coal (8/un)→planks(1.5). count_fuel = ceil(restante/8)
    if (needsFuel(furnace)) await furnace.putFuel(fuelId, null, ceil(remaining/itemsPerUnit))
    await furnace.putInput(oreId, null, 1)              // D-06: 1 item por chamada (loop cede entre itens)
    // D-10: espera o 'update' com guarda de timeout + AbortSignal; verdade = outputItem()
    await waitForOutput(furnace, { timeoutMs: config.smeltUpdateTimeoutMs, signal })  // ~12s (>10s/item)
    await furnace.takeOutput()                          // Item retornado é a verdade
  } catch (e) { threw = e }
  finally { furnace.close() }                           // D-08: SEMPRE (fim e abort)
  const after = captureGroundState(bot)
  return evaluateSmelt(before, after, oreName, threw)   // delta de iron_ingot etc.
}
```
**Confirmações:**
- `bot.openFurnace(furnaceBlock)` → `Promise<Furnace>`. Métodos: `putInput(itemType, metadata, count)`, `putFuel(itemType, metadata, count)`, `takeOutput()→Promise<Item>`, `inputItem()`/`outputItem()`/`fuelItem()→Item`, props `fuel` e `progress` (0..1), evento `'update'`, e `close()` (herdado da window).
- `progress`/`fuel` (0..1) só dizem *quando* checar — NÃO são a verdade (D-10). Esperar o `'update'` com timeout (>10s/item) e ler `outputItem()`/o `Item` de `takeOutput()`.
- **1 window por vez** — vazar a window bloqueia interações futuras → `close()` obrigatório no `finally` E no caminho de abort (D-08).
- **Re-roda entre itens (D-06):** após `close()`, retornar `partial` se `count>1` e ainda há minério → o execute node (`nodes.ts:294`) registra `partial` como não-sucesso mas emite `actionFinished` (`nodes.ts:348`), o driver re-percebe e a próxima deliberação re-chama smelt. NÃO há flag persistente — a pendência É o input restante no inventário/fornalha (D-07). *Discrição:* alternativamente, manter `outcome:'success'` por item e deixar a deliberação decidir re-chamar; o mais simples que faz o loop ceder vence.

### Pattern 5: equip — grounding LOCAL (D-16/D-19)
```typescript
// B1: standalone
async function equip(bot, { itemName, destination }): Promise<SkillResult> {
  const item = bot.inventory.items().find(i => i.name === itemName)
  if (!item) return { outcome:'no_effect', observed:0, expected:1, delta:{}, reason:'item ausente' }
  const dest = destination ?? 'hand'
  let threw = null
  try { await bot.equip(item, dest) } catch (e) { threw = e }
  // D-19: grounding LOCAL (equip NÃO muda contagem de inventário) — molde do bot.food do eat.ts.
  const equipped = dest === 'hand'
    ? bot.heldItem?.name === itemName
    : armorSlot(bot, dest)?.name === itemName     // slots de armadura: inventory.slots[5..8]
  return { outcome: equipped ? 'success' : 'no_effect', observed: equipped?1:0, expected:1, delta:{}, reason: threw?msg(threw):undefined }
}
// B2: pré-flight em dig/attack (helper compartilhado)
function selectToolFor(category): Item|null {  // D-17: binário, sem tier
  return bot.inventory.items().find(matchesCategory(category)) ?? null  // /_pickaxe$/, /_(sword|axe)$/
}
```
**Confirmações:**
- `bot.equip(item, destination)`: destinos `'hand'` (default), `'head'`, `'torso'`, `'legs'`, `'feet'`, `'off-hand'`.
- equip **não** altera `inventory.items()` counts → grounding por delta de inventário é cego. Ler `bot.heldItem` (mão) ou `bot.inventory.slots[5..8]` (armadura: 5=head,6=torso,7=legs,8=feet) — análogo a `bot.food` em `eat.ts` (Pitfall 2 da Fase 7: não tocar o GroundState genérico).

### Anti-Patterns to Avoid
- **Derivar o outcome do place/craft/smelt da resolução/rejeição da Promise.** Em server lagado, `placeBlock` rejeita por timeout mas o bloco foi colocado. Sempre verificar por `blockAt`/delta (GRND-01). É o ponto que mais protege o critério #1.
- **Adicionar listeners manuais de `blockUpdate`/`'update'` sem cleanup.** O mineflayer já usa `onceWithCleanup` (com `.finally(removeListener)`). Para o `'update'` da fornalha, usar `onceWithCleanup`/`once` com cleanup OU o `executeWithSafety` como racer — nunca acumular `on('update')` sem `off`.
- **Esquecer `furnace.close()`.** 1 window por vez; vazar trava `openFurnace`/`craft` futuros. Sempre no `finally`.
- **Deixar `bot.craft` lançar por falta de mesa.** Faz o execute node cair no catch genérico (`nodes.ts:321`) como `error` em vez do `no_effect` semântico (D-15 #3).
- **Bloquear o loop fundindo um stack inteiro.** Funde 1 item, cede, re-percebe (D-06/D-11). Lotes pequenos no escopo desta fase.

## Don't Hand-Roll

| Problema | Não construir | Usar | Por quê |
|----------|---------------|------|---------|
| Resolução de receita (shaped/shapeless, 2x2 vs 3x3) | parser de grid próprio | `bot.recipesFor`/`recipesAll` + `Recipe` (prismarine-recipe) | `requiresTable`/`delta`/`result` já computados corretamente p/ a versão do MC |
| Consumir ingredientes nos slots da bancada | cliques manuais em slots | `bot.craft(recipe, count, table)` | mineflayer faz os cliques shaped/shapeless + `putMaterialsAway`+`grabResult` |
| Confirmação de colocação de bloco | polling de `blockAt` em loop | `bot.placeBlock` (que usa `onceWithCleanup` no `blockUpdate`) + swallow seletivo | listener já com cleanup; só tratar o falso-negativo de timeout |
| Espera de fim de smelt | `setInterval` lendo `progress` | evento `'update'` da fornalha + timeout guard | `progress` é 0..1 indicativo; `outputItem()`/`takeOutput()` é a verdade |
| Navegar até a estação | mover manualmente | `pathfinder` `GoalNear`/`GoalGetToBlock` (já em `dig.ts`) | herda bounds 999.1 (anti-OOM) |
| Dedup de POI da estação | tabela nova | `upsertPlace`/`nearbyPlaces` (bucket GRID 12) | já implementado na Fase 08.1 |

**Key insight:** A mecânica determinística (resolver receita, achar/posicionar estação, escolher fuel, equipar categoria) é o "engenheiro de precisão" — quase tudo já existe na API nativa do mineflayer + nos helpers da Fase 7/8.1. O trabalho real é o **glue grounded** (swallow seletivo, delta-as-truth, ciclo de fornalha sem travar/vazar) + os 4 helpers puros testáveis.

## Common Pitfalls

### Pitfall 1: Timeout de placeBlock tratado como falha (falso-negativo)
**What goes wrong:** Em server com lag, `Event blockUpdate:<pos> did not fire within timeout of 5000ms` é lançado mesmo com o bloco JÁ colocado. Tratar como falha gera retry que recoloca/desperdiça ou reporta falha falsa.
**Why it happens:** O servidor não confirmou o `blockUpdate` dentro de 5s, mas a colocação ocorreu (issue #2757).
**How to avoid:** swallow seletivo do erro `/did not fire within timeout/` + verificar `bot.blockAt(alvo)` — a verdade é o mundo (D-01).
**Warning signs:** placeBlock "falhando" intermitentemente em sucesso aparente; bloco aparece no mundo apesar do `partial`/`error`.

### Pitfall 2: equip avaliado por delta de inventário (sempre no_effect)
**What goes wrong:** equip não muda `inventory.items()` counts → delta vazio → outcome sempre `no_effect` mesmo equipando com sucesso.
**Why it happens:** Equipar move o item entre slots, não cria/destrói.
**How to avoid:** grounding LOCAL via `bot.heldItem`/`inventory.slots[5..8]` (D-19), igual ao `bot.food` do `eat.ts`. NÃO usar `captureGroundState`/delta p/ equip.
**Warning signs:** `equip` reporta `no_effect` mas `bot.heldItem` mudou.

### Pitfall 3: Window de fornalha vazada (trava interações futuras)
**What goes wrong:** Esquecer `furnace.close()` (ou só fechar no caminho feliz) deixa a window aberta; `openFurnace`/`craft` seguintes penduram ou falham.
**Why it happens:** mineflayer permite 1 window por vez.
**How to avoid:** `furnace.close()` em `finally` (cobre throw E abort, D-08).
**Warning signs:** segundo smelt/craft pendura; "window already open".

### Pitfall 4: craft lança por falta de mesa em vez de no_effect
**What goes wrong:** `bot.craft` lança `Recipe requires craftingTable, but one was not supplied` → execute node registra `error` (não `no_effect`), poluindo o sinal de grounding.
**How to avoid:** gate D-15 #3 — checar `requiresTable && !table` (ou `recipes.length===0` após tentar com mesa) e retornar `no_effect` antes de chamar `bot.craft`.

### Pitfall 5: id vs name no registry (bug histórico do eat.ts)
**What goes wrong:** Indexar receitas/itens por `item.type` em vez de `name`/id correto. O `eat.ts` quase matou o bot por isso (`foods[it.type]` undefined — comentário em eat.ts:40-42).
**How to avoid:** `bot.registry.itemsByName[name].id` para nome→id; passar esse id ao `recipesFor`. Validar com um log no boot/teste.

### Pitfall 6: smelt bloqueando o loop / não-preemptável
**What goes wrong:** Fundir um stack inteiro em uma chamada trava o loop ~10s × N (sem responder a perigo).
**How to avoid:** funde 1 item, `close()`, cede (`actionFinished`), re-percebe (D-06/D-11). Guarda de timeout (>10s) + AbortSignal no `waitForOutput`. Aceito ~10s não-preemptável por item individual (escopo: lotes pequenos).

## Code Examples

### Erros canônicos (mineflayer 4.37.1 — fonte verificada)
```javascript
// lib/promise_utils.js — onceWithCleanup (timeout = FALSO-NEGATIVO):
`Event ${event} did not fire within timeout of ${timeout}ms`
// → na prática: "Event blockUpdate:(x, y, z) did not fire within timeout of 5000ms"
// cleanup garantido: task.promise.catch(()=>{}).finally(() => emitter.removeListener(event, onEvent))

// lib/plugins/place_block.js — pós-check (FALHA GENUÍNA):
if (oldBlock?.type === newBlock.type) {
  throw new Error(`No block has been placed : the block is still ${oldBlock?.name}`)
}

// lib/plugins/craft.js — gate de mesa (lança ANTES de craftar):
"Recipe requires craftingTable, but one was not supplied: " + JSON.stringify(recipe)
```

### Eficiência de combustível (Minecraft Wiki — confirmado)
```
1 item de smelt = 10s (200 ticks). Itens por unidade de combustível:
  coal        = 8       charcoal = 8 (preferir: renovável via smelt de log)
  coal block  = 80      blaze rod = 12
  log         = 1.5     lava bucket = 100
  planks      = 1.5 (descartável p/ 1-2 itens)
putFuel count = ceil(itensRestantes / itensPorUnidade)   // D-09
```

### Slots de armadura (prismarine-windows inventory)
```typescript
// bot.inventory.slots[5..8]: 5=head, 6=torso, 7=legs, 8=feet (helmet/chestplate/leggings/boots)
// bot.inventory.slots[45] = off-hand (1.9+). Quickbar começa em 36 (confirmado nos docs).
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `mineflayer-pvp` / `mineflayer-auto-eat` p/ combate/comida | API nativa (`bot.attack`, `bot.consume`, `bot.equip`) | decisão do projeto (plugins abandonados ~4 anos) | esta fase usa SÓ API nativa p/ place/craft/smelt/equip — banidos por CLAUDE.md/REQUIREMENTS |
| `sqlite-vec` p/ vetores | ChromaDB (serviço externo) | Fase 08.1 | irrelevante p/ Fase 9 (sem vetores); SQLite é só relacional agora |
| placeBlock mínimo em `shelter.ts` (try/catch) | wrapper robusto compartilhado | Fase 9 (D-05) | shelter refatorado p/ consumir; testes Fase 7/8 revalidados |

**Deprecated/outdated:**
- Confiar na resolução da Promise de `placeBlock`/`craft` como verdade → substituído por delta/blockAt (GRND-01, Fase 7).

## Open Questions

1. **`waitForOutput` — `'update'` vs polling de `progress`?**
   - O que sabemos: a fornalha emite `'update'` quando fuel/progress mudam; `progress` chega a 1 ao terminar; `outputItem()` passa a retornar o Item.
   - O que não está claro: em alguns casos o `'update'` pode não disparar exatamente no fim (timing do servidor). Recomendação: usar `onceWithCleanup(furnace, 'update', {timeout})` num loop curto que checa `outputItem()`/`progress`, com timeout total > 10s + AbortSignal. A verdade final é `takeOutput()` (D-10) — se vier `null`/lança, o delta de inventário ainda decide o outcome.

2. **`getRefAndFace` — predicado de "alcançável".**
   - O que sabemos: o ref deve ser sólido e a face apontando ao alvo deve estar exposta ao ar.
   - O que não está claro: o critério fino de alcance (linha de visão / distância de braço ~4-5 blocos). Recomendação (Claude's discretion D-01 C): preferir faces adjacentes ao bot, validar `bot.canSeeBlock`/distância ≤ ~4.5, e fazer `lookAt` antes (padrão mineflayer-builder). Testar o helper puro com mundo mockado.

3. **Re-roda smelt entre itens — `partial` vs `success`-por-item.**
   - O que sabemos: o execute node emite `actionFinished` e re-percebe; `partial` é registrado como não-sucesso (GRND-04).
   - Recomendação: retornar `success` quando o item-alvo foi obtido (delta>0) mesmo havendo mais minério, e deixar a deliberação re-chamar smelt enquanto houver minério (o `observed/expected` por-item já comunica progresso). Evita marcar sucessos reais como falha. Decisão fina = Claude's discretion (D-06 nota).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| mineflayer | placeBlock/craft/furnace/equip | ✓ | 4.37.1 | — |
| mineflayer-pathfinder | navegar até estação | ✓ | 2.4.5 | — |
| prismarine-recipe | Recipe shape | ✓ (transitivo) | via mineflayer | — |
| prismarine-windows | furnace window/slots | ✓ (transitivo) | via mineflayer | — |
| zod | schemas | ✓ | 4.4.3 | — |
| Servidor Minecraft Java (1.21.4) | teste ao vivo da cadeia | runtime (config.mcVersion=1.21.4) | depende do host | testes unitários com bot mockado (padrão `*.test.ts` + `bun test`) |
| LM Studio | deliberação (não no caminho determinístico das skills) | runtime | — | skills funcionam sem LLM (chamáveis por nome) |

**Sem dependências bloqueantes novas.** Nenhuma instalação necessária. Validação ao vivo da cadeia (tronco→tábuas→bancada→picareta→fornalha→ferro) exige um servidor Java rodando, mas os helpers puros (`getRefAndFace`, `evaluateCraft/Smelt/Equip`, `selectToolFor`, `matchesCategory`) e o contrato SkillResult são testáveis via `bun test` com bot mockado (já é o padrão de `shelter.test.ts`/`dig.test.ts`/`eat.test.ts`).

> **Validation Architecture:** SKIPPED — `workflow.nyquist_validation` é `false` em `.planning/config.json`. Os testes seguem o padrão existente: `*.test.ts` colocados ao lado da skill, rodados com `bun test`.

## Existing Codebase Contracts (verificado — não adivinhar)

**SkillResult** (`src/grounding/types.ts`): `{ outcome: 'success'|'partial'|'no_effect'|'error'; observed: number; expected: number; delta: Record<string,number>; reason?: string }`. Outcome deriva de observed vs expected, NUNCA da Promise.

**captureGroundState(bot, targetPos?)** (`capture.ts`): retorna `GroundState` imutável (`inventoryCount`, `itemsByName`, `position`, `targetBlockName`, `capturedAt`). **inventoryDelta(before, after)**: `Record<string,number>` só de chaves que mudaram. Molde de uso: `dig.ts:41,124-133`.

**evaluate.ts**: `evaluateDig(before, after, expected)` e `evaluateNavigate(...)` — puros, classificam por delta numérico. Adicionar `evaluateCraft`/`evaluateSmelt` (molde `evaluateDig`, gainedTotal do item-alvo) e `evaluateEquip` (LOCAL).

**executeWithSafety(action, opts)** (`executor.ts`): timeout (default 30s) + watchdog opcional (`progressChecker`) + AbortSignal (4º racer) + delay gaussiano pré/pós. Cada skill se auto-embrulha (NÃO há wrap externo no execute node — `nodes.ts:259`). placeBlock/craft/smelt devem se embrulhar com seus próprios timeouts (config novos).

**SkillFunction** (`index.ts:27`): `(bot: Bot, params: unknown) => Promise<SkillResult>`. **skillRegistry** (`index.ts:42`) e **toolRegistry** (`index.ts:57`): registrar `placeBlock`/`craft`/`smelt`/`equip` + seus `*Tool` (com `schema` Zod `.toJSONSchema()`). Padrão de extrair `signal` antes do `.parse()` (ver `dig.ts:39`, `eat.ts:33`).

**shelter.ts placeBlock mínimo** (L52-97): dois branches — cavar-e-tampar (`bot.dig(below1)` + `bot.placeBlock(headRef, {x:0,y:-1,z:0})`) e pilar 1×1 (`equip`+`lookAt`+jump+`placeBlock(belowRef, {x:0,y:1,z:0})`). Grounding por cobertura real (`blockAt(pos+2y)`). **D-05:** trocar as 2 chamadas `bot.placeBlock` cruas pelo `placeBlockSafe`, mantendo os branches e a lógica de cobertura. `makeVec(x,y,z)` retorna `{x,y,z} as Vec3` (faceVector aceita objeto plano — confirmado).

**execute node** (`nodes.ts:285-348`): `result = await skillRegistry[skill](bot, {target/JSON, signal})`; `success = result.outcome === 'success'`; grava `holder.lastObservedDelta` + `recordEvent` (com outcome/observed/expected) ANTES do `triggerBus.emit('actionFinished', {skill, outcome})` (nodes.ts:348). **Smelt re-roda (D-06):** já encaixa — após `actionFinished`, o driver re-percebe e a deliberação re-chama. NÃO precisa tocar o grafo. `partial`/`no_effect`/`error` = failure no recordFailure (GRND-04).
> **Nota de fiação:** o execute node hoje só monta `skill`/`target` para `gathering`(dig)/`exploring`/`socializing`(navigate). Para `craft`/`smelt`/`equip`/`placeBlock` serem chamadas pelo loop, é preciso que a deliberação/estado emita esses skills+params (provavelmente via `llmDecision.target` ou novo estado). **Isso pode tocar `nodes.ts:184-225` (mapeamento estado→skill) e/ou a deliberação** — verificar no planejamento se entra nesta fase ou se as skills só são registradas (chamáveis) e a fiação cognitiva é Fase 10/11. CONTEXT foca em registrar as skills; a fiação ao loop pode ser parcial.

**PlaceType** (`persistence.ts:25`): `'base'|'resource'|'danger'|'village'|'landmark'` → adicionar `'station'` (D-14). `places.type` é TEXT nullable sem CHECK no SQLite — mudança é só de tipo TS. **upsertPlace**/**nearbyPlaces** (`places.ts`) já aceitam `PlaceType` genérico (dedup bucket GRID 12) — sem mudança de assinatura.

**config.ts**: adicionar (Claude's discretion sobre nomes/valores) — `placeTimeoutMs` (~6000, > os 5000 internos), `placeRetries` (D-04, ~2-3, default 0/off), `smeltUpdateTimeoutMs` (~12000, > 10s/item), `smeltTimeoutMs` total. `gatherSearchRadius=16` já existe (reuso p/ `findBlock` da estação, D-12). Adicionar validações de range no bloco de validação (padrão das linhas 242-323).

## Sources

### Primary (HIGH confidence)
- mineflayer 4.37.1 `lib/plugins/place_block.js` — erro genuíno `No block has been placed : the block is still <name>`; placeBlock NÃO equipa (usa `_genericPlace`); `onceWithCleanup(bot, blockUpdate:<pos>, {timeout:5000})`.
- mineflayer `lib/promise_utils.js` — `onceWithCleanup`: erro de timeout `Event <event> did not fire within timeout of <ms>ms`; cleanup via `.finally(removeListener)` em todos os caminhos (sem leak).
- mineflayer `lib/plugins/craft.js` — `bot.craft` lança `Recipe requires craftingTable, but one was not supplied: <json>`; consumo shaped/shapeless via `findInventoryItem`+cliques; `putMaterialsAway`+`grabResult`.
- mineflayer `docs/api.md` — assinaturas de placeBlock/recipesFor/recipesAll/craft/openFurnace/Furnace/equip/heldItem.
- prismarine-recipe `lib/recipe.js` — Recipe: `result.{id,metadata,count}`, `inShape`, `outShape`, `ingredients`, `requiresTable` (shape>2x2 ou >4 slots), `delta` (consumidos negativos, resultado positivo).
- Minecraft Wiki (Smelting) — fuel: coal/charcoal 8, coal block 80, blaze rod 12, log 1.5, lava bucket 100; 10s (200 ticks)/item.
- Codebase lido diretamente: `shelter.ts`, `dig.ts`, `eat.ts`, `attack.ts`, `grounding/{types,capture,evaluate}.ts`, `skills/{executor,index}.ts`, `cognition/nodes.ts`, `memory/{places,persistence}.ts`, `config.ts`, `package.json`, `.planning/config.json`.

### Secondary (MEDIUM confidence)
- mineflayer issue #2757 (referenciada no CONTEXT) — race do `blockUpdate` em server lagado (motiva o swallow seletivo). Não re-fetchada; consistente com a fonte do place_block.js.
- mineflayer-builder `getFaceAndRef` (referenciado no CONTEXT) — padrão de escolha de ref+face+lookAt. Conceito adotado; assinatura exata não re-verificada.
- Slots de armadura `inventory.slots[5..8]` (5=head..8=feet), off-hand 45 — convenção prismarine-windows; consistente com docs (quickbar=36). Confirmar índice exato no runtime se necessário (D-19 menciona 5..8).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — todas as deps já em package.json; versões verificadas (mineflayer 4.37.1).
- API placeBlock/craft/furnace/equip: HIGH — strings de erro e assinaturas lidas na fonte do mineflayer 4.37.1.
- Fuel efficiency: HIGH — confirmado na Minecraft Wiki.
- getRefAndFace alcançabilidade + waitForOutput timing: MEDIUM — predicado fino é Claude's discretion; comportamento de timing do `'update'` pode variar por servidor.
- Slots de armadura exatos: MEDIUM — convenção consistente; confirmar no runtime se o índice divergir.
- Fiação cognitiva (estado→craft/smelt/equip): MEDIUM — o execute node hoje só fia dig/navigate; escopo da fiação ao loop deve ser esclarecido no planejamento.

**Research date:** 2026-06-21
**Valid until:** ~2026-07-21 (mineflayer 4.x é estável; re-checar se a versão pinada mudar)
