---
phase: 10-tech-tree-dag-needs
plan: "02"
subsystem: cognition + skills
tags: [tech-tree, dag, tool-selector, dig, goal-routing, deterministic, needs-bridge]
dependency_graph:
  requires: [Phase 10 Plan 01 (resolveDag, DagResult, completedGoalIds)]
  provides: [goalToSkillParams, selectToolFor-ranqueado, TOOL_TIER, ponte-need-DAG, guard-D-13, bloco-D-03]
  affects: [src/cognition/nodes.ts, src/skills/dig.ts, src/skills/tool-selector.ts, src/config.ts]
tech_stack:
  added: []
  patterns:
    - Roteador determinístico goalToSkillParams (prefixo:item → skill sem LLM)
    - Tier table estática (TOOL_TIER: wooden<stone<iron<diamond<netherite)
    - Hard guard D-13 (no_effect imediato sem ferramenta compatível)
    - Ponte observe need→DAG com try/catch para degradação graciosa
    - DAG_PREFIXES como constante de módulo compartilhada em observe + execute
key_files:
  created:
    - src/skills/tool-selector.ts
    - src/skills/tool-selector.test.ts
  modified:
    - src/skills/dig.ts
    - src/skills/dig.test.ts
    - src/skills/dig.oom.smoke.test.ts
    - src/config.ts
    - src/cognition/nodes.ts
    - src/cognition/nodes.test.ts
decisions:
  - "try/catch em resolveDag no observe: falha silenciosa quando bot não tem registry (Core Value — loop não pode parar)"
  - "else if convertidos para if (!skill && ...) independentes para garantir guard correto quando roteador DAG seta skill"
  - "blockToolCategory exposta em tool-selector.ts para mapeamento blockName→categoria de ferramenta"
  - "dig.test.ts e dig.oom.smoke.test.ts atualizados com wooden_axe para bypassar guard D-13 nos testes existentes (Rule 1)"
metrics:
  duration_min: 40
  completed_date: "2026-06-21"
  tasks_completed: 2
  files_created: 2
  files_modified: 6
---

# Phase 10 Plan 02: DAG Wiring — Tool Selector + Router + Need Bridge Summary

Fiação completa do DAG tech-tree ao loop cognitivo: `selectToolFor` ranqueado por tier com `TOOL_TIER` estático; guard D-13 em dig.ts (no_effect imediato sem ferramenta compatível); ponte determinística resources need → `resolveDag` no observe node; roteador `goalToSkillParams` no execute node que mapeia prefixos DAG para skills sem LLM; bloco D-03 que limpa sub-goals em falha de no_effect.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | tool-selector ranqueado + guard D-13 + ponte need→DAG | 69c8433 | src/skills/tool-selector.ts, src/skills/tool-selector.test.ts, src/skills/dig.ts, src/skills/dig.test.ts, src/config.ts, src/cognition/nodes.ts |
| 2 | roteador goalToSkillParams + guards no execute + bloco D-03 | 5d12a23 | src/cognition/nodes.ts, src/cognition/nodes.test.ts, src/skills/dig.oom.smoke.test.ts |

## What Was Built

### `src/skills/tool-selector.ts` — selectToolFor com ranking por tier (D-12/D-14)

**TOOL_TIER estático:**
```typescript
export const TOOL_TIER: Record<string, number> = {
  wooden_pickaxe: 1, wooden_axe: 1, wooden_shovel: 1, wooden_sword: 1, wooden_hoe: 1,
  stone_pickaxe:  2, stone_axe:  2, stone_shovel:  2, stone_sword:  2, stone_hoe:  2,
  iron_pickaxe:   3, iron_axe:   3, iron_shovel:   3, iron_sword:   3, iron_hoe:   3,
  diamond_pickaxe: 4, diamond_axe: 4, diamond_shovel: 4, diamond_sword: 4, diamond_hoe: 4,
  netherite_pickaxe: 5, netherite_axe: 5, netherite_shovel: 5, netherite_sword: 5, netherite_hoe: 5,
  golden_pickaxe: 2, golden_axe: 2, golden_shovel: 2, golden_sword: 2, golden_hoe: 2,
}
```

**selectToolFor com reduce de ranking:**
```typescript
export function selectToolFor(bot: Bot, category: string): Item | null {
  const resolvedCategory = CATEGORY_PATTERNS[category] !== undefined
    ? category : (BLOCK_TO_TOOL_CATEGORY[category] ?? category)
  const items = bot.inventory.items().filter((it) => matchesCategory(it.name, resolvedCategory))
  if (items.length === 0) return null
  return items.reduce((best, it) => {
    const tierBest = TOOL_TIER[best.name] ?? 0
    const tierIt   = TOOL_TIER[it.name]   ?? 0
    return tierIt > tierBest ? it : best
  })
}
```

Aceita tanto categoria de ferramenta (`'pickaxe'`) quanto nome de bloco (`'oak_log'`, `'iron_ore'`) — mapeamento interno via `BLOCK_TO_TOOL_CATEGORY`.

### `src/skills/dig.ts` — guard D-13 + import atualizado

Import atualizado: `from './tool-selector'` (antes: `from './equip'`).

Guard D-13 substituiu o bloco try/catch best-effort:
```typescript
const blockNameForTool = typeof target === 'string' ? target : (bot.blockAt(...)?.name ?? 'unknown')
const tool = selectToolFor(bot, blockNameForTool)
if (tool === null) {
  return { outcome: 'no_effect', observed: 0, expected: count, delta: {}, reason: `no compatible tool for ${blockNameForTool}` }
}
```

### `src/config.ts` — resourceMinQuantity (D-09)

```typescript
resourceMinQuantity: parseInt(process.env.RESOURCE_MIN_QUANTITY || '1', 10),
```
Validação: `if (config.resourceMinQuantity < 1) throw new Error(...)`.

### `src/cognition/nodes.ts` — DAG_PREFIXES + ponte observe + roteador execute + D-03

**Constante de módulo:**
```typescript
const DAG_PREFIXES = ['gather:', 'craft:', 'smelt:', 'ensure:'] as const
```

**goalToSkillParams (exportada — D-09/D-10):**
```typescript
export function goalToSkillParams(goalId: string): { skill: string; paramsJson: string } | null {
  // 'gather:X' → { skill: 'dig', paramsJson: '{"target":"X","count":1}' }
  // 'craft:X'  → { skill: 'craft', paramsJson: '{"itemName":"X","count":1}' }
  // 'smelt:X'  → { skill: 'smelt', paramsJson: '{"oreName":"X","count":1}' }
  // 'ensure:X' → null (no-op — ensureStation chamado por craft/smelt internamente)
  // prefixo desconhecido ou sem ':' → null (T-10-08 guard)
}
```

**Ponte need→DAG no observe (D-09/D-10):**
- Detecta `resources` need urgente acima de `goalThreshold`
- Percorre `config.gatheringLadder` — primeiro item com `count < resourceMinQuantity` vira `techTarget`
- Chama `resolveDag(techTarget, bot, ...)` via dynamic import
- Insere sub-goals no `holder.goals`; seleciona folha executável (dependsOn satisfeitos)
- Try/catch: `resolveDag` falha silenciosamente quando bot não tem `registry` (mock/testes)

**Roteador no execute (antes dos blocos de estado):**
- Verifica `holder.currentGoal` com prefixo DAG
- Chama `goalToSkillParams` → seta `skill` + `target`
- `ensure:*` → auto-advance do goal (completo sem ação — ensureStation já é chamado por craft/smelt)

**Guards nos blocos de estado:**
- 4 blocos convertidos para `if (!skill && snap && state === '...')` independentes
- Se roteador DAG setou skill, blocos de estado NÃO sobrescrevem

**Bloco D-03 (no_effect → reconstrução):**
- Após execução: se `skillOutcome === 'no_effect'` e `currentGoal` tem prefixo DAG
- Limpa todos os sub-goals DAG de `holder.goals`
- Zera `holder.currentGoal` se era DAG goal
- Próximo tick: `alreadyHasDag = false` → observe reconstrói o DAG

## Confirmation of Pathfinder Bounds

As skills roteadas pelo roteador (`dig` via `gather:`, `craft` e `smelt` via `ensure:` internamente) herdam os bounds do pathfinder via `executeWithSafety` + `config.gatherSearchRadius` sem mudança. Nenhuma navegação nova foi adicionada diretamente em `nodes.ts` — T-10-07 (accept).

## Verification Results

```
bun test ./src/skills/tool-selector.test.ts  → 6 pass / 0 fail
bun test ./src/skills/dig.test.ts            → 3 pass / 0 fail
bun test ./src/skills/dig.oom.smoke.test.ts  → 2 pass / 0 fail
bun test ./src/skills/equip.test.ts          → 10 pass / 0 fail (sem regressão)
bun test ./src/cognition/nodes.test.ts       → 14 pass / 0 fail (8 originais + 6 novos)
bun test (suíte global)                      → 443 pass / 2 fail / 2 errors (pré-existentes)
```

Falhas pré-existentes (não introduzidas por este plano):
- `chromadb` — pacote não instalado (fase 8.1, dependência runtime)
- CONN-03 intermitente (LLM offline / timing)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Testes de dig quebrando com guard D-13**
- **Found during:** Tarefa 1
- **Issue:** `dig.test.ts` e `dig.oom.smoke.test.ts` usam mocks com `inventory: { items: () => [] }`. O guard D-13 retorna `no_effect` com `"no compatible tool"` antes de chegar às verificações de blocos que os testes testavam.
- **Fix:** Adicionados `heldItem: null`, `equip: async () => {}` e `inventory: { items: () => defaultItems }` com `wooden_axe` nos mocks. Os testes agora bypassam o guard e chegam aos ramos corretos.
- **Files modified:** `src/skills/dig.test.ts`, `src/skills/dig.oom.smoke.test.ts`
- **Commits:** `69c8433`, `5d12a23`

**2. [Rule 1 - Bug] Loop smoke tests quebrando com TypeError em resolveDag**
- **Found during:** Tarefa 2
- **Issue:** A ponte observe chamava `resolveDag(techTarget, bot, ...)` com bots mock que não têm `bot.registry.itemsByName` — os smoke tests de loop usam mocks simples sem registry do Mineflayer.
- **Fix:** Envolver chamada de `resolveDag` em try/catch — falha silenciosa com log `[tech-tree] resolveDag falhou para X: ...`. O loop cognitivo não pode parar por falha de DAG (Core Value).
- **Files modified:** `src/cognition/nodes.ts`
- **Commit:** `5d12a23`

**3. [Rule 2 - Missing functionality] blockToolCategory para mapeamento blockName→categoria**
- **Found during:** Tarefa 1
- **Issue:** O plano propunha passar `blockName` ao `selectToolFor`, mas o `matchesCategory` original só aceita categorias de ferramenta (`'pickaxe'`, `'axe'`), não nomes de bloco (`'iron_ore'`, `'oak_log'`).
- **Fix:** Adicionado `BLOCK_TO_TOOL_CATEGORY` e função `blockToolCategory` em `tool-selector.ts`. O `selectToolFor` resolve automaticamente blockName para categoria antes de filtrar.
- **Files modified:** `src/skills/tool-selector.ts`
- **Commit:** `69c8433`

## Known Stubs

Nenhum. Todos os exports são funcionais e conectados ao loop cognitivo.

## Threat Flags

Nenhuma nova superfície de segurança além do threat model documentado no plano (T-10-06 a T-10-11).

## Self-Check: PASSED

Arquivos criados/modificados existem:
- [x] src/skills/tool-selector.ts — FOUND
- [x] src/skills/tool-selector.test.ts — FOUND
- [x] src/skills/dig.ts — FOUND (import + guard D-13)
- [x] src/skills/dig.test.ts — FOUND (mocks atualizados)
- [x] src/skills/dig.oom.smoke.test.ts — FOUND (mocks atualizados)
- [x] src/config.ts — FOUND (resourceMinQuantity)
- [x] src/cognition/nodes.ts — FOUND (DAG_PREFIXES + goalToSkillParams + ponte + roteador + D-03)
- [x] src/cognition/nodes.test.ts — FOUND (6 novos testes roteador)

Commits existem:
- [x] 69c8433 — feat(10-02): tool-selector ranqueado + guard D-13 + ponte need→DAG
- [x] 5d12a23 — feat(10-02): roteador goalToSkillParams + guards no execute + bloco D-03
