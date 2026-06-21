---
phase: 10-tech-tree-dag-needs
plan: "01"
subsystem: motivation
tags: [tech-tree, dag, goal-system, selectGoal, dependencies]
dependency_graph:
  requires: [Phase 09 (placement/crafting/grounding)]
  provides: [resolveDag, SMELT_MAP, DagResult, completedIds filtro em selectGoal]
  affects: [src/motivation/goals.ts, src/cognition/state.ts, src/cognition/nodes.ts]
tech_stack:
  added: []
  patterns: [DAG topológico com memo+cap, smelt map estático verificado primeiro, fallback gather, completedIds filter em selectGoal]
key_files:
  created:
    - src/motivation/tech-tree.ts
    - src/motivation/tech-tree.test.ts
  modified:
    - src/motivation/goals.ts
    - src/motivation/goals.test.ts
    - src/cognition/state.ts
    - src/cognition/nodes.ts
decisions:
  - "DAG retorna lista plana em ordem topológica (folhas primeiro) — Claude's Discretion (não árvore aninhada)"
  - "IDs de goal com prefixo simples (gather:/craft:/smelt:/ensure:) — legíveis nos logs sem colisão"
  - "smelt:iron_ore depende do último sub-goal da cadeia do sourceResult (dependsOn: [id do último])"
  - "nodes.ts: advanceProgress chamado em TODO outcome=success (não só sub-goals DAG) — consistência"
metrics:
  duration_min: 25
  completed_date: "2026-06-21"
  tasks_completed: 2
  files_created: 2
  files_modified: 4
---

# Phase 10 Plan 01: Tech Tree DAG Resolver + selectGoal completedIds Summary

Módulo puro `resolveDag` com smelt map estático verificado primeiro (elimina ciclo iron_ingot), fallback gather para itens sem receita, cap de 8 níveis + memo por itemId. `selectGoal` evoluído com 5º parâmetro `completedIds: Set<string>` (backward-compatible) que filtra goals bloqueados por dependsOn antes da histerese. Wiring completo em `nodes.ts` (observe passa o set; execute registra completions).

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | resolveDag puro + SMELT_MAP + testes DAG | 524ff82 | src/motivation/tech-tree.ts, src/motivation/tech-tree.test.ts |
| 2 | selectGoal completedIds + wiring nodes.ts | 0a32cf3 | src/motivation/goals.ts, src/motivation/goals.test.ts, src/cognition/state.ts, src/cognition/nodes.ts |

## What Was Built

### `src/motivation/tech-tree.ts` — Módulo puro de DAG

**Assinatura final de `resolveDag`:**
```typescript
export function resolveDag(
  targetItem: string,
  bot: Bot,
  memo: Map<string, DagResult> = new Map(),
  depth: number = 0,
  basePriority: number = 0.8,
  now: number = Date.now(),
): DagResult  // Goal[] | { unresolvable: true }
```

**SMELT_MAP utilizado:**
```typescript
export const SMELT_MAP: Record<string, string> = {
  iron_ingot:   'iron_ore',
  copper_ingot: 'raw_copper',
  gold_ingot:   'raw_gold',
  coal:         'coal_ore',
  glass:        'sand',
  smooth_stone: 'stone',
}
```

**Ordem de lookup (crítica para evitar ciclo iron_ingot):**
1. `SMELT_MAP[targetItem]` — PRIMEIRO (Pitfall 1: iron_ingot tem receitas de crafting que criariam ciclo)
2. `bot.recipesAll(id, null, true)` — planejamento (não recipesFor que checa inventário)
3. Fallback gather — item sem receita

**Estrutura de IDs de goal adotada:**
| Prefixo | Tipo | Exemplo |
|---------|------|---------|
| `gather:` | coleta do mundo via dig | `gather:iron_ore` |
| `craft:` | crafting via craft.ts | `craft:wooden_pickaxe` |
| `smelt:` | smelting via smelt.ts | `smelt:iron_ore` |
| `ensure:` | estação via ensureStation | `ensure:crafting_table` |

### `src/motivation/goals.ts` — selectGoal evoluído

5º parâmetro `completedIds: Set<string> = new Set()` adicionado.
Filtro de goals bloqueados aplicado ANTES da histerese (D-06):
```typescript
const unblocked = candidates.filter(g =>
  g.dependsOn.every(depId => completedIds.has(depId))
)
```
Goals com `dependsOn: []` sempre passam (retrocompat garantida — hoje todos os goals gerados por `generateGoals` têm `dependsOn: []`).

### `src/cognition/state.ts` — CognitiveStateHolder

Novo campo `completedGoalIds: Set<string>` inicializado com `new Set<string>()`. Persiste durante a sessão.

### `src/cognition/nodes.ts` — Wiring

- **observe**: passa `holder.completedGoalIds` como 5º arg ao `selectGoal`
- **execute**: após `outcome=success`, chama `advanceProgress(currentGoal, 1)`, atualiza `holder.goals`, `holder.currentGoal` e registra `goalId` em `holder.completedGoalIds`

## Interfaces Exportadas para Plan 02 Consumir

```typescript
// src/motivation/tech-tree.ts
export type DagResult = Goal[] | { unresolvable: true }
export const SMELT_MAP: Record<string, string>
export function resolveDag(targetItem, bot, memo?, depth?, basePriority?, now?): DagResult

// src/motivation/goals.ts (evoluído)
export function selectGoal(current, candidates, ctx, cfg, completedIds?): Goal | null

// src/cognition/state.ts (evoluído)
// CognitiveStateHolder.completedGoalIds: Set<string>
```

O Plan 02 deve:
1. Chamar `resolveDag` quando `resources` need está insatisfeita (ponte need→DAG determinística, D-09)
2. Inserir os sub-goals DAG no `holder.goals` para que `selectGoal` os filtre corretamente
3. Mapear `goal.id` (prefixo) → skill a executar sem LLM (gather:→dig, craft:→craft, smelt:→smelt, ensure:→ensureStation)

## Verification Results

```
bun test ./src/motivation/           →  39 pass / 0 fail (3 arquivos)
bun test (suíte global)              →  419 pass / 3 fail (pré-existentes) / 1 skip
```

Fails pré-existentes (não introduzidos por este plano):
- `config > carrega com valores default sem .env` — lê `.env` local (Known Gap desde v1.0)
- 2 erros `chromadb` — pacote não instalado (fase 8.1, dependência runtime)

## Deviations from Plan

### Auto-fixed Issues

Nenhum — plano executado exatamente como escrito.

### Notas de Implementação

1. **`smelt:iron_ore` dependsOn**: o goal de smelt depende do último sub-goal da cadeia do `sourceResult` (o gather do minério). Isso garante ordem topológica correta sem hardcode do ID do gather.

2. **`advanceProgress` em todo `success`**: aplicado a `holder.currentGoal` em todo `outcome=success` (não só sub-goals DAG). Isso é mais correto — qualquer goal avança progresso quando bem-sucedido.

3. **Deduplicação de sub-goals**: `resolveRecipe` deduplicata sub-goals pelo ID quando múltiplos ingredientes compartilham um pré-requisito (ex: oak_planks para sticks e para a picareta em si).

## Known Stubs

Nenhum. Todos os exports são funcionais. O Plan 02 é que conecta o DAG à need `resources` (ponte D-09) — sem ele, `resolveDag` existe mas nunca é chamado em produção. Isso é intencional: o Plan 01 entrega o módulo puro testado; o Plan 02 faz a fiação runtime.

## Self-Check: PASSED

Arquivos criados/modificados existem:
- [x] src/motivation/tech-tree.ts — FOUND
- [x] src/motivation/tech-tree.test.ts — FOUND
- [x] src/motivation/goals.ts — FOUND (campo completedIds)
- [x] src/motivation/goals.test.ts — FOUND (4 novos testes)
- [x] src/cognition/state.ts — FOUND (campo completedGoalIds)
- [x] src/cognition/nodes.ts — FOUND (wiring selectGoal + advanceProgress)

Commits existem:
- [x] 524ff82 — feat(10-01): implementar resolveDag puro + SMELT_MAP + testes DAG
- [x] 0a32cf3 — feat(10-01): evoluir selectGoal com completedIds + wiring nodes.ts
