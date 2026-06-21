# Phase 10: Tech Tree DAG + Needs - Research

**Researched:** 2026-06-21
**Domain:** DAG recursivo de receitas Minecraft, seleção de ferramenta por tier, ponte need→goal determinística
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### DAG Resolver (TECH-01)
- **D-01:** Estratégia **Híbrida**: resolve o DAG **completo** com `bot.recipesFor` / `recipesAll` + memo por itemId + cap de 8 níveis; **só executa a folha executável** — o ancestral cujo `dependsOn` está vazio ou completamente satisfeito (progress ≥ 1).
- **D-02:** Resolver vive em **`src/motivation/tech-tree.ts`** — módulo puro sem referência ao grafo LangGraph. Assinatura: `resolveDag(targetItem: string, bot: Bot, memo?: Map<string, Goal[]>): Goal[]`. Retorna lista topológica com `dependsOn` populado.
- **D-03:** DAG construído **uma vez ao criar o goal de alto nível** (não recalculado a cada tick). Falha de sub-goal → reconstrução na próxima tentativa.
- **D-04:** **Cap de 8 níveis** + **Memo por itemId** previne ciclos. Cap atingido → `{ unresolvable: true }` → goal pai como `failed`.
- **D-05:** **Fallback gather**: `recipesFor(itemId)` retorna vazio → sub-goal `gather:itemId`.

#### selectGoal com dependsOn (TECH-03)
- **D-06:** `selectGoal` recebe `Set<string>` de IDs completos; filtra goals cujo `dependsOn` contém qualquer ID ausente do set. Backward-compatible.
- **D-07:** Sub-goal **completo** quando `goal.progress >= 1` — usando `advanceProgress` existente.
- **D-08:** Item `unresolvable` → goal pai com `status: 'blocked'` → removido dos candidatos.

#### Ponte necessidade → item alvo (TECH-02, TECH-03, TECH-04)
- **D-09:** `resources` insatisfeita → inspecionar inventário → percorrer `config.gatheringLadder` → primeiro item sem quantidade suficiente → passa ao `resolveDag`. Sem LLM.
- **D-10:** DAG acionado **diretamente** pela não-satisfação. LLM pode sobrescrever (preempção ASSISTANT).
- **D-11:** Satisfação de `resources` por **delta de inventário** pós-ação.

#### Ferramenta certa por tier (TECH-05)
- **D-12:** Tabela estática de tier: `wooden_*=1, stone_*=2, iron_*=3, diamond_*=4`. Melhor tier disponível no inventário. Sem consulta ao minecraft-data por tier mínimo do bloco.
- **D-13:** Pré-flight de `dig` chama `selectToolFor(bot, blockId)` antes de qualquer tentativa. Sem ferramenta compatível → `no_effect` imediato.
- **D-14:** `tool-selector.ts` **evolui o `selectToolFor` atual** (D-17 da Fase 9). Zero mudança no ponto de chamada em `dig.ts`.

### Claude's Discretion
- Estrutura exata de retorno do `resolveDag` (lista plana ordenada vs. árvore aninhada)
- Representação dos IDs de goals de tech-tree (ex: `tech:craft:iron_pickaxe` vs. `craft:iron_pickaxe`)
- Onde no grafo LangGraph o DAG é reconstruído ao receber falha de sub-goal
- Quantidade mínima de cada item da `gatheringLadder` para considerar "satisfeito"
- Heurística de "quantidade suficiente" para a satisfaction de `resources`

### Deferred Ideas (OUT OF SCOPE)
- Curriculum adaptativo ao bioma (TECH-F1)
- Esticar a tech tree além de diamante (TECH-F2)
- Ferramenta mínima por bloco via minecraft-data
- Goal-raiz persistente entre sessões
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TECH-01 | Resolver pré-requisitos de item-alvo recursivamente (DAG via minecraft-data) | API `bot.recipesAll`, mc.recipes, memo + depth cap, smelt map, requiresTable detection |
| TECH-02 | Progressão autônoma madeira → pedra → ferro (diamante como esticar) | gatheringLadder + DAG completo verificado: oak_log→planks→table→wooden_pick→cobble→stone_pick→iron_ore→iron_ingot→iron_pick |
| TECH-03 | `Goal.dependsOn` preenchido; seleção respeita dependências; needs reordenam dynamicamente | `selectGoal` extensão com `completedIds`, `advanceProgress` existente, bridge need→goal |
| TECH-04 | Needs internas reordenam prioridade de objetivos em runtime | `urgency()` + `generateGoals()` + ponte determinística D-09/D-10 |
| TECH-05 | Pré-flight de ferramenta antes de minerar; tier ranking | `selectToolFor` com tabela tier estática; pré-flight em `dig.ts` (ponto de extensão D-17 Fase 9) |
</phase_requirements>

---

## Summary

A Fase 10 adiciona ao MineMind a capacidade de resolver recursivamente a cadeia de pré-requisitos de qualquer item do Minecraft (Tech Tree DAG), popular `Goal.dependsOn` e avançar autonomamente pela progressão madeira→pedra→ferro sem intervenção do LLM. A pesquisa verificou a API do mineflayer (`bot.recipesAll`/`bot.recipesFor`), a estrutura do minecraft-data e identificou os pitfalls críticos que o planejador precisa endereçar.

O ponto mais crítico descoberto é que `iron_ingot` tem receitas de CRAFTING (9 iron_nuggets → 1 iron_ingot) que criam um ciclo imediato (iron_ingot → iron_nugget → iron_ingot) quando o DAG não tem um smelt map estático. Sem o smelt map, o resolveDag escolhe o caminho errado e a progressão falha. A solução exige que o smelt map seja verificado **ANTES** de consultar `mc.recipes`, fazendo smelting ter prioridade sobre crafting para itens como iron_ingot.

Um segundo achado importante: `wooden_pickaxe` e `stone_pickaxe` têm shape 3x3 e **exigem crafting table** — o que significa que `crafting_table` deve ser um sub-goal implícito sempre que `recipe.requiresTable = true`. Isso é tratado pelo `ensureStation` existente, mas o DAG precisa adicionar o sub-goal `craft:crafting_table` se a tabela não existir no mundo.

**Recomendação principal:** Implementar `src/motivation/tech-tree.ts` com smelt map verificado primeiro, depois receitas (bot.recipesAll), depois fallback gather. Reutilizar `ensureStation` para o sub-goal de estação implícita. Evoluir `selectToolFor` com tabela estática de tier.

---

## Standard Stack

### Core — Já instalado no projeto

| Library | Version | Purpose | Confidence |
|---------|---------|---------|------------|
| `mineflayer` | 4.37.1 | `bot.recipesFor`, `bot.recipesAll`, `bot.registry` | HIGH — verificado no codebase |
| `minecraft-data` | (transitive via mineflayer) | `mc.recipes`, `mc.blocksByName`, `mc.materials` | HIGH — verificado via node |
| `prismarine-recipe` | (transitive via mineflayer) | Classe `Recipe` com `requiresTable`, `delta` | HIGH — verificado via node |
| `zod` | 4.4.3 | Schema de params do novo módulo (Goal IDs) | HIGH — padrão do projeto |

### Sem dependências novas

A Fase 10 **não adiciona dependências npm**. Todo o stack necessário (mineflayer, minecraft-data, prismarine-recipe, zod) já está instalado como dependência do mineflayer e do projeto. [VERIFIED: package.json + node_modules]

---

## Architecture Patterns

### Estrutura de Módulos (novos arquivos)

```
src/
├── motivation/
│   ├── tech-tree.ts      # NOVO: resolveDag + smelt map + tipo DagNode
│   ├── goals.ts          # EVOLUI: selectGoal ganha parâmetro completedIds
│   └── types.ts          # INTOCADO: Goal.dependsOn já existe como string[]
├── skills/
│   └── tool-selector.ts  # NOVO: evolução do selectToolFor com ranking por tier
```

`dig.ts`, `nodes.ts`, `needs.ts`, `config.ts` — editados (não criados).

### Pattern 1: DAG Resolver — `resolveDag`

**O que é:** Módulo puro que constrói o grafo completo de sub-goals para um item-alvo, em ordem topológica (folhas primeiro).

**Assinatura (D-02):**
```typescript
// Source: CONTEXT.md D-02 (decisão do usuário)
export function resolveDag(
  targetItem: string,
  bot: Bot,
  memo: Map<string, Goal[]> = new Map(),
  depth: number = 0,
): Goal[] | { unresolvable: true }
```

**Fluxo interno:**
```
resolveDag(iron_pickaxe)
  1. memo.has('iron_pickaxe')? → return cached
  2. depth >= 8? → return { unresolvable: true }
  3. smeltMap['iron_pickaxe']? → NO
  4. bot.recipesAll(id, null, true) → [Recipe with inShape 3x3]
  5. recipe.requiresTable? YES → add sub-goal 'ensure:crafting_table'
  6. For each ingredient (iron_ingot, stick):
     - resolveDag('iron_ingot') → smeltMap: iron_ore → ['gather:iron_ore', 'smelt:iron_ore']
     - resolveDag('stick')      → recipes → ['craft:oak_planks', 'craft:stick']
  7. Topological order: [gather:oak_log, craft:oak_planks, craft:stick, gather:iron_ore, smelt:iron_ore, craft:iron_pickaxe]
  8. Set dependsOn for each node
  9. memo.set('iron_pickaxe', result) → memoize
```

**Tipos de nó (IDs de Goal sugeridos para "Claude's Discretion"):**
```typescript
// Prefixos recomendados (legíveis nos logs, sem colisão):
'gather:oak_log'          // coleta do mundo
'craft:wooden_pickaxe'    // crafting via craft.ts
'smelt:iron_ore'          // smelting via smelt.ts
'ensure:crafting_table'   // estação via ensureStation
'ensure:furnace'          // estação via ensureStation
```

### Pattern 2: Smelt Map Estático

**Crítico:** verificado antes de `mc.recipes` para evitar ciclo iron_ingot→iron_nugget→iron_ingot.

```typescript
// Source: verificado via minecraft-data 1.21.4 nesta sessão [VERIFIED]
const SMELT_MAP: Record<string, string> = {
  'iron_ingot':   'iron_ore',
  'copper_ingot': 'raw_copper',
  'gold_ingot':   'raw_gold',
  // coal, glass, smooth_stone etc. se necessário no futuro
}
// Ordem de lookup: smeltMap PRIMEIRO, depois bot.recipesAll, depois gather fallback
```

### Pattern 3: Tier Table Estática

**Para `selectToolFor` com ranking (D-12):**

```typescript
// Source: derivado do minecraft-data materials [VERIFIED via node em 2026-06-21]
const TOOL_TIER: Record<string, number> = {
  wooden_pickaxe: 1, wooden_axe: 1, wooden_shovel: 1,
  stone_pickaxe:  2, stone_axe:  2, stone_shovel:  2,
  iron_pickaxe:   3, iron_axe:   3, iron_shovel:   3,
  diamond_pickaxe: 4, diamond_axe: 4, diamond_shovel: 4,
  netherite_pickaxe: 5, netherite_axe: 5, netherite_shovel: 5,
}

// selectToolFor evoluído: retorna a ferramenta de MAIOR tier da categoria disponível
export function selectToolFor(bot: Bot, category: string): Item | null {
  const items = bot.inventory.items().filter(it => matchesCategory(it.name, category))
  if (items.length === 0) return null
  return items.reduce((best, it) => {
    const tierBest = TOOL_TIER[best.name] ?? 0
    const tierIt   = TOOL_TIER[it.name]   ?? 0
    return tierIt > tierBest ? it : best
  })
}
```

### Pattern 4: Ponte Need→Goal Determinística (D-09)

```typescript
// Em nodes.ts (observe) ou em tech-tree.ts (helper puro)
// Quando resources.urgency > goalThreshold:
function pickTechTarget(snap: WorldSnapshot, cfg: MotivationConfig): string | null {
  const inventory = new Set(snap.inventory.map(s => s.name))
  for (const item of cfg.gatheringLadder) {
    if (!inventory.has(item)) return item  // primeiro que falta
  }
  return null  // tudo na ladder presente → resources satisfeita
}
// O item retornado é passado ao resolveDag como targetItem
```

### Pattern 5: selectGoal com completedIds (D-06)

```typescript
// src/motivation/goals.ts — extensão backward-compatible
export function selectGoal(
  current: Goal | null,
  candidates: Goal[],
  ctx: SelectGoalContext,
  cfg: MotivationConfig,
  completedIds: Set<string> = new Set(), // NOVO PARAM — default vazio = zero quebra de compatibilidade
): Goal | null {
  // Filtra bloqueados ANTES da histerese
  const unblocked = candidates.filter(g =>
    g.dependsOn.every(depId => completedIds.has(depId))
  )
  // ... resto da lógica existente usando `unblocked` em vez de `candidates`
}
```

### Anti-Patterns a Evitar

- **Não usar `bot.recipesFor` no DAG de planejamento:** `recipesFor` checa o inventário atual e retorna vazio se os ingredientes não estão presentes — isso colapsa o DAG para a situação corrente, não planeja o que coletar. Usar `bot.recipesAll(id, null, true)` ou `mc.recipes[id]` para planejamento.
- **Não confiar em `mc.recipes[id][0]` por index:** `wooden_pickaxe` tem 12 variantes; o índice 0 usa `pale_oak_planks`, não `oak_planks`. O DAG deve selecionar a receita por disponibilidade de ingredientes, não por índice fixo.
- **Não esquecer o smelt map:** Iron_ingot tem receitas de crafting (de iron_nuggets e iron_block) que criam ciclos no DAG. O smelt map deve ser consultado **primeiro**.
- **Não detectar loop por exceção de stack:** Usar memo + depth cap em vez de deixar o stack estourar.

---

## Don't Hand-Roll

| Problema | Não Construir | Usar em vez | Por quê |
|----------|--------------|-------------|---------|
| Verificar se bloco cai com a ferramenta | Lógica custom de harvestTools | D-12: tabela tier estática | Suficiente para a progressão vanilla; harvestTools via mc.data é complexidade extra sem ganho no escopo |
| Localizar/posicionar estação para smelting/crafting | Nova lógica de findBlock+navigate | `ensureStation` existente (station.ts) | Já implementado na Fase 9 com dedup POI, bounds do 999.1 e fallback place |
| Grounding do resultado das skills | Novo sistema de verificação | `SkillResult`/`evaluateCraft`/`evaluateSmelt` existentes | Contrato da Fase 7, reutilizado por todas as skills |
| Tracking de progresso do goal | Novo campo de estado | `advanceProgress(goal, delta)` existente | Imutável, puro, já em uso |
| Loop event-driven entre sub-goals | Nova máquina de estados | `actionFinished` + `triggerBus` existentes | A progressão folha-a-folha encaixa naturalmente no loop 07.1 |
| Craft de item com resolução de receita | Nova call ao bot.craft | `craft.ts` existente com `ensureStation` | Já resolve 2x2/3x3, gate de mesa, grounding por delta |

---

## Common Pitfalls

### Pitfall 1: iron_ingot → Ciclo no DAG se smelt map não for verificado primeiro

**O que vai errado:** `mc.recipes[iron_ingot_id]` retorna receitas de crafting (9 iron_nuggets → 1 iron_ingot; 1 iron_block → 9 iron_ingots). Ao resolver o DAG, o resolveDag vai encontrar `iron_ingot` tem receitas, vai tentar resolver `iron_nugget` → que por sua vez tem receita `iron_ingot → iron_nugget` → **ciclo perfeito**.

**Por que acontece:** minecraft-data não tem dados de smelting (`mc.smeltingRecipes` não existe em 1.21.4). As receitas de crafting do iron_ingot são reais mas não são o caminho prático (exigem iron_nuggets que só vêm de iron_ingots).

**Como evitar:** Verificar `SMELT_MAP[itemName]` **ANTES** de `mc.recipes` / `bot.recipesAll`. Se o item está no smelt map, o sub-goal é `smelt:source_item`, não `craft:item`.

**Sinal de alerta:** resolveDag retorna `{ unresolvable: true }` para iron_pickaxe — indica ciclo ou caminho errado. [VERIFIED: via minecraft-data 1.21.4 em 2026-06-21]

---

### Pitfall 2: wooden_pickaxe requer crafting_table (3x3) — que deve ser sub-goal

**O que vai errado:** Tentar craftar `wooden_pickaxe` sem crafting_table no mundo retorna `no_effect: 'sem receita executável'` (gate do craft.ts). O agente fica em loop tentando o mesmo craft.

**Por que acontece:** `wooden_pickaxe` tem shape 3x3 → `requiresTable = true`. O `computeRequiresTable` da prismarine-recipe retorna `true` se qualquer dimensão do inShape > 2. O `crafting_table` em si tem shape 2x2 → `requiresTable = false` (pode ser crafta no inventário).

**Como evitar:** Quando `recipe.requiresTable = true`, o resolveDag deve adicionar um sub-goal `ensure:crafting_table` **antes** do sub-goal de craft. O `ensureStation` existente trata de localizar/posicionar a mesa.

**Sinal de alerta:** Craft retorna `no_effect: 'sem receita executável'` para wooden_pickaxe mesmo com planks e sticks no inventário. [VERIFIED: via prismarine-recipe source em 2026-06-21]

---

### Pitfall 3: `mc.recipes[wooden_pickaxe_id][0]` usa pale_oak_planks, não oak_planks

**O que vai errado:** Se o DAG resolve ingredientes via índice fixo `[0]`, vai adicionar `gather:pale_oak_planks` como sub-goal em vez de `gather:oak_log` (cujos planks são `oak_planks` na receita índice 11).

**Por que acontece:** minecraft-data lista recipes de wooden_pickaxe em ordem alfabética de plank type. `pale_oak_planks` (índice 0) é o primeiro; `oak_planks` (índice 11) é o último dos 12 variantes.

**Como evitar:** Para cada item-alvo com múltiplas receitas alternativas (variantes de plank), usar `bot.recipesAll` que respeita o contexto de inventário, OU para planejamento puro: escolher a receita cujos ingredientes estejam na `gatheringLadder` ou sejam mais fáceis de obter (oak_log vs pale_oak_log). Alternativa simples: na execução, `craft.ts` já usa `bot.recipesFor` que automaticamente escolhe a receita satisfazível com o inventário atual. O DAG precisa apenas registrar "precisa de ALGUM tipo de plank".

**Abordagem recomendada:** O DAG registra `craft:wooden_pickaxe` como folha. Na execução, `craft.ts` resolve a receita correta via `bot.recipesFor`. Para os sub-goals de ingredientes, o DAG pode usar a forma canônica (`craft:planks` sem tipo) ou qualquer variante — o execution node vai usar `craft.ts` que resolve dinamicamente. [VERIFIED: via minecraft-data 1.21.4 em 2026-06-21]

---

### Pitfall 4: `bot.recipesFor` retorna `[]` para 3x3 sem craftingTable no mundo — falso "sem receita"

**O que vai errado:** `bot.recipesFor(wooden_pickaxe_id, null, 1, null)` retorna `[]` porque a receita é 3x3 e o segundo argumento é `null` (sem craftingTable). O DAG interpreta como "sem receita" e aciona fallback gather.

**Por que acontece:** `requirementsMetForRecipe` retorna `false` quando `recipe.requiresTable && !craftingTable`. Passar `null` como `craftingTable` equivale a "não tenho mesa".

**Como evitar:** Para **planejamento** do DAG, usar `bot.recipesAll(id, null, true)` (passa `true` em vez de um `Block`) — que filtra apenas por `!recipe.requiresTable || craftingTable`, sem checar inventário. Isso retorna a receita mesmo sem ter a mesa no mundo. Para verificar `requiresTable`, acessar `recipe.requiresTable` diretamente.

**Distinção crítica:** `bot.recipesFor` = "posso craftar agora?" (inventário + mesa presente); `bot.recipesAll` = "existe uma receita?" (estrutural, sem checar inventário). O DAG de planejamento usa `recipesAll`. [VERIFIED: via mineflayer/lib/plugins/craft.js em 2026-06-21]

---

### Pitfall 5: Iron_ingot como goal intermediário — não está na gatheringLadder

**O que vai errado:** A `gatheringLadder` tem `iron_ore` mas não `iron_ingot`. O DAG de iron_pickaxe gera sub-goal `smelt:iron_ore → iron_ingot`. Se o execute node não sabe lidar com o sub-goal `smelt:*`, o agente nunca progride além da mineração.

**Por que acontece:** O execute node atual em `nodes.ts` rota estado `building` para skill `smelt` via `fresh.decision.action === 'smelt'`. Mas os sub-goals do DAG de tech-tree precisam ser executados **sem** depender do LLM decidir `smelt` — é a ponte determinística (D-10).

**Como evitar:** O execute node (ou um roteador de tech-tree) deve mapear o tipo do sub-goal current para a skill correta: `gather:X` → `dig(X)`, `craft:X` → `craft(X)`, `smelt:X` → `smelt(X)`, `ensure:X` → `ensureStation(X)`. Isso é a ponte D-09/D-10 sem LLM.

---

### Pitfall 6: Bounds do pathfinder não herdados nas novas navegações do tech-tree

**O que vai errado:** Sub-goals que navegam até minério (`gather:iron_ore`) ou até estação (`ensure:furnace`) chamam o pathfinder sem os bounds do 999.1, causando regressão de OOM.

**Por que acontece:** Os bounds (searchRadius/thinkTimeout) são configurados no setup do pathfinder no boot, mas chamadas diretas a `bot.pathfinder.goto` ou `bot.collectBlock.collect` dentro de skills podem ignorar os bounds se as skills não herdarem corretamente.

**Como evitar:** Toda skill que navega (`dig`, `craft` via `ensureStation`, `smelt` via `ensureStation`) já usa `executeWithSafety` + `gatherSearchRadius` (verificado em dig.ts e station.ts). O resolveDag em si não navega — são as skills que fazem isso. Confirmar que `ensureStation` usa `GoalNear` com `maxDistance: config.gatherSearchRadius`. **Critério de aceite explícito do roadmap:** "Toda nova chamada de pathfinder herda os bounds do 999.1". [VERIFIED: station.ts usa config.gatherSearchRadius e GoalNear]

---

## Code Examples

### Exemplo 1: Como verificar requiresTable via bot.recipesAll

```typescript
// Source: verificado via mineflayer/lib/plugins/craft.js [VERIFIED]
// bot.recipesAll(itemType, metadata, craftingTable) -> Recipe[]
// Quando craftingTable=true (ou qualquer Block), retorna receitas incluindo as que precisam de mesa
// Quando craftingTable=null/undefined, só retorna receitas sem mesa

const recipes = bot.recipesAll(itemId, null, /* craftingTable= */ true)
// recipes[0].requiresTable: boolean — true se a receita exige mesa
// recipes[0].delta: Array<{id, count, metadata}> — ingredientes como delta de inventário
// Ingredientes com count < 0: consumidos; count > 0: produzidos
```

### Exemplo 2: Extrair ingredientes de uma receita para o DAG

```typescript
// Source: prismarine-recipe Recipe.delta [VERIFIED via source inspection]
// recipe.delta é um array de {id, count, metadata} onde count < 0 = consumido
// Para identificar ingredientes únicos a resolver:
function getIngredientNames(recipe: Recipe, bot: Bot): string[] {
  if (!recipe.delta) return []
  return recipe.delta
    .filter(d => d.count < 0)  // consumidos = ingredientes
    .map(d => bot.registry.items[d.id]?.name)
    .filter((name): name is string => name !== undefined)
}
// Alternativa via inShape para shaped recipes:
// recipe.inShape.flat().filter(x => x !== null).map(id => bot.registry.items[id]?.name)
```

### Exemplo 3: Estrutura de Goal do DAG

```typescript
// Source: src/motivation/types.ts Goal interface [VERIFIED]
// Sub-goals do DAG populam dependsOn com IDs dos ancestrais diretos
const gatherOakLog: Goal = {
  id: 'gather:oak_log',
  kind: 'gather',
  priority: 0.8, // derivado da urgência da need resources
  progress: 0,
  dependsOn: [],          // folha: sem dependência
  source: 'need',
  committedAt: Date.now(),
}
const craftOakPlanks: Goal = {
  id: 'craft:oak_planks',
  kind: 'craft',
  priority: 0.8,
  progress: 0,
  dependsOn: ['gather:oak_log'],  // precisa do log primeiro
  source: 'need',
  committedAt: Date.now(),
}
```

### Exemplo 4: Rota determinística goal-tipo → skill

```typescript
// Para o execute node mapear sub-goal do DAG para skill sem LLM (D-09/D-10)
// Source: padrão nodes.ts G-01 [VERIFIED]
function goalToSkillParams(goal: Goal): { skill: string; params: unknown } | null {
  const [type, item] = goal.id.split(':')
  switch (type) {
    case 'gather':
      return { skill: 'dig', params: { target: item, count: 1 } }
    case 'craft':
      return { skill: 'craft', params: { itemName: item, count: 1 } }
    case 'smelt':
      return { skill: 'smelt', params: { oreName: item, count: 1 } }
    case 'ensure':
      // ensureStation é chamado internamente por craft/smelt — pode ser no_op aqui
      return null
    default:
      return null
  }
}
```

---

## State of the Art

| Abordagem Antiga | Abordagem Atual | Versão/Fase | Impacto |
|------------------|-----------------|-------------|---------|
| `selectToolFor` binário (qualquer tool da categoria) | `selectToolFor` com ranking por tier | Fase 10 (esta) | Agente usa iron_pickaxe em vez de wooden_pickaxe para minerar iron_ore |
| `dependsOn: []` sempre vazio (stub) | `dependsOn` populado pelo DAG | Fase 10 (esta) | `selectGoal` filtra goals bloqueados por dependências não satisfeitas |
| `resources` need → LLM decide o que fazer | `resources` need → ponte determinística → `resolveDag` | Fase 10 (esta) | Progressão tech-tree sem depender do LLM fraco entender a cadeia |
| `craft.ts` sem resolução recursiva | `tech-tree.ts` resolve DAG + `craft.ts` executa folha | Fase 10 (esta) | Ponto de extensão D-15 da Fase 9 consumado |

---

## Assumptions Log

| # | Claim | Section | Risk se Errado |
|---|-------|---------|----------------|
| A1 | O `bot.recipesAll(id, null, true)` aceita `true` como `craftingTable` (não apenas Block) | Code Examples | `true` é truthy → `!recipe.requiresTable || craftingTable` passa; baixo risco |
| A2 | A progressão iron_pickaxe é alcançável com profundidade ≤ 8 (D-04) | Summary | Verificada manualmente em ~5-6 níveis; cap de 8 é suficiente |
| A3 | `vanilla cobblestone` é o ingrediente correto para `furnace` e `stone_pickaxe` | Common Pitfalls | Verificado: recipe[2] de furnace e recipe[2] de stone_pickaxe usam cobblestone (id 35) [VERIFIED] |

**Se a tabela estiver vazia:** todos os claims foram verificados ou citados — nenhuma confirmação do usuário necessária além dos itens acima (baixo risco).

---

## Open Questions

1. **Representação de sub-goal para ingrediente "qualquer plank"**
   - O que sabemos: `wooden_pickaxe` aceita 12 variantes de plank; `gatheringLadder` tem `oak_log` que produz `oak_planks`
   - O que é indefinido: o ID do sub-goal deve ser `craft:oak_planks` (concreto) ou `craft:planks` (genérico)?
   - Recomendação: usar o ID concreto do item que o agente vai produzir (`craft:oak_planks`), já que o `craft.ts` na execução chama `bot.recipesFor` que escolhe a variante disponível no inventário. A ambiguidade de plank é resolvida na execução, não no planejamento.

2. **Onde o execute node detecta "sub-goal atual completo → próxima folha"**
   - O que sabemos: `advanceProgress(goal, 1)` marca como completo; `triggerBus.emit('actionFinished')` acorda o observe
   - O que é indefinido: quem chama `advanceProgress` para sub-goals do DAG (hoje não é chamado em nodes.ts)
   - Recomendação: o execute node deve chamar `advanceProgress` no `holder.currentGoal` quando `result.outcome === 'success'` e atualizar `holder.goals` + `holder.currentGoal` no holder. O observe no próximo tick re-roda `selectGoal` com o set de completos atualizado.

3. **Gatilho de reconstrução do DAG em falha inesperada**
   - O que sabemos: D-03 diz que falha de sub-goal com `no_effect` reconstrói o DAG na próxima tentativa
   - O que é indefinido: onde exatamente (observe? execute?) o holder limpa os sub-goals do DAG atual
   - Recomendação: o execute node, ao receber `outcome: 'no_effect'` num sub-goal do DAG, deve limpar `holder.currentGoal` e os goals filhos do DAG, deixando apenas o goal de alto nível (ex: `need:resources`). O observe no próximo tick regera via `resolveDag`.

---

## Environment Availability

Verificado: nenhuma dependência externa nova além das já instaladas.

| Dependência | Requerida Por | Disponível | Versão | Fallback |
|-------------|--------------|-----------|--------|---------|
| `mineflayer` (bot.recipesAll) | DAG resolver | ✓ | 4.37.1 | — |
| `minecraft-data` (mc.recipes) | smelt map validation | ✓ | (transitive) | — |
| `prismarine-recipe` (Recipe.requiresTable) | DAG requiresTable check | ✓ | (transitive) | — |

**Nenhuma dependência bloqueante identificada.** [VERIFIED: node_modules]

---

## Security Domain

Seção omitida — Fase 10 é puramente código de jogabilidade interna; nenhuma interface de rede nova, sem input externo de usuário não validado, sem criptografia. Requisitos ASVS não se aplicam a módulos de lógica de jogo local.

---

## Sources

### Primary (HIGH confidence)
- `node_modules/mineflayer/lib/plugins/craft.js` — `recipesFor`, `recipesAll`, `requirementsMetForRecipe` verificados via leitura direta do source [VERIFIED: 2026-06-21]
- `node_modules/prismarine-recipe/lib/recipe.js` — `computeRequiresTable` verificado via leitura direta; lógica: `inShape.length > 2 || row.length > 2 → true` [VERIFIED: 2026-06-21]
- `minecraft-data 1.21.4` — `mc.recipes[iron_pickaxe_id]`, `mc.recipes[wooden_pickaxe_id]`, `mc.blocksByName['iron_ore'].harvestTools`, `mc.materials` verificados via `node -e` [VERIFIED: 2026-06-21]
- `src/motivation/types.ts` — `Goal.dependsOn: string[]` existente, `advanceProgress` puro [VERIFIED: leitura direta]
- `src/skills/equip.ts` — `selectToolFor` binário (ponto de extensão D-17), padrão `find()` sem tier [VERIFIED: leitura direta]
- `src/skills/craft.ts` — `bot.recipesFor(id, null, count, null)` para 2x2, `ensureStation` para 3x3, gate de mesa D-15 [VERIFIED: leitura direta]
- `src/skills/station.ts` — `ensureStation` com `gatherSearchRadius`, `GoalNear`, POI dedup [VERIFIED: leitura direta]
- `src/config.ts` — `gatheringLadder` completa, `gatherSearchRadius`, `pathfinderSearchRadius` [VERIFIED: leitura direta]

### Secondary (MEDIUM confidence)
- `.planning/phases/10-tech-tree-dag-needs/10-CONTEXT.md` — decisões D-01..D-14 do usuário; base de toda a arquitetura desta fase [CITED: arquivo local]
- `.planning/phases/09-placement-crafting-smelting-grounded/09-CONTEXT.md` — D-15 (ponto extensão craft), D-17 (ponto extensão selectToolFor) [CITED: arquivo local]

---

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — todas as dependências verificadas no node_modules local
- Architecture Patterns: HIGH — API do mineflayer verificada via source; ciclos confirmados via execução de node
- Pitfalls: HIGH — descobertos por execução real de `node -e` com minecraft-data 1.21.4; não apenas training data

**Research date:** 2026-06-21
**Valid until:** 2026-07-21 (stable — minecraft-data + mineflayer são libs estáveis; API não mudou em muitos meses)
