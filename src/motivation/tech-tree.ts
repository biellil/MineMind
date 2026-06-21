// src/motivation/tech-tree.ts
// Módulo PURO de resolução de DAG de tech-tree (TECH-01/D-01..D-05).
// Sem referência ao grafo LangGraph — apenas bot + tipos de motivação.
// Resolve o grafo COMPLETO de pré-requisitos de um item-alvo em ordem topológica,
// populando Goal.dependsOn para que selectGoal possa filtrar goals bloqueados (D-06).
import type { Bot } from 'mineflayer'
import type { Goal } from './types'

// ---------------------------------------------------------------------------
// Tipo de retorno
// ---------------------------------------------------------------------------

/** Resultado do resolveDag: lista plana em ordem topológica OU unresolvable. */
export type DagResult = Goal[] | { unresolvable: true }

// ---------------------------------------------------------------------------
// SMELT_MAP estático (verificado via minecraft-data 1.21.4 — Pitfall 1 CRÍTICO)
// Verificado ANTES de bot.recipesAll para evitar ciclo iron_ingot→iron_nugget→iron_ingot.
// ---------------------------------------------------------------------------
export const SMELT_MAP: Record<string, string> = {
  iron_ingot:   'iron_ore',
  copper_ingot: 'raw_copper',
  gold_ingot:   'raw_gold',
  coal:         'coal_ore',    // carvão pode ser fundido de coal_ore
  glass:        'sand',
  smooth_stone: 'stone',
}

// ---------------------------------------------------------------------------
// resolveDag — módulo puro (D-02)
// Ordem de lookup: smeltMap PRIMEIRO, depois recipesAll, depois gather fallback
// ---------------------------------------------------------------------------

/**
 * Resolve o DAG completo de pré-requisitos de um item-alvo (D-01..D-05).
 *
 * @param targetItem  - Nome do item-alvo (ex: 'iron_pickaxe')
 * @param bot         - Instância do mineflayer Bot (para bot.recipesAll + bot.registry)
 * @param memo        - Cache por itemId (default: novo Map) — previne ciclos e recálculo (D-04)
 * @param depth       - Profundidade atual de recursão (default: 0) — cap em 8 (D-04)
 * @param basePriority - Prioridade base dos sub-goals (herda do goal pai)
 * @param now         - Timestamp atual em ms (módulo puro — sem Date.now() direto)
 * @returns Lista plana de Goals em ordem topológica (folhas primeiro) OU { unresolvable: true }
 */
export function resolveDag(
  targetItem: string,
  bot: Bot,
  memo: Map<string, DagResult> = new Map(),
  depth: number = 0,
  basePriority: number = 0.8,
  now: number = Date.now(),
): DagResult {
  // 1. Verificar cache (D-04: memo previne ciclos e recálculo)
  if (memo.has(targetItem)) return memo.get(targetItem)!

  // 2. Cap de profundidade (D-04: cap de 8 níveis — suficiente para madeira→diamante)
  if (depth >= 8) return { unresolvable: true }

  let result: DagResult

  // 3. SMELT_MAP PRIMEIRO (Pitfall 1 CRÍTICO — evitar ciclo iron_ingot)
  const smeltSource = SMELT_MAP[targetItem]
  if (smeltSource !== undefined) {
    // Resolver recursivamente o item-fonte (ex: iron_ore para iron_ingot)
    const sourceResult = resolveDag(smeltSource, bot, memo, depth + 1, basePriority, now)
    if ('unresolvable' in sourceResult) {
      result = { unresolvable: true }
    } else {
      // Sub-goal de smelt: depende do gather do item-fonte
      const smeltGoalId = `smelt:${smeltSource}`
      const smeltGoal: Goal = {
        id: smeltGoalId,
        kind: 'smelt',
        priority: basePriority,
        progress: 0,
        dependsOn: sourceResult.map(g => g.id).slice(-1), // depende do último sub-goal da cadeia
        source: 'need',
        committedAt: now,
      }
      result = [...sourceResult, smeltGoal]
    }
    memo.set(targetItem, result)
    return result
  }

  // 4. Tentar bot.recipesAll (Pitfall 4: usar recipesAll, NÃO recipesFor — para planejamento)
  const itemEntry = (bot.registry.itemsByName as Record<string, { id: number } | undefined>)[targetItem]
  const itemId = itemEntry?.id

  if (itemId !== undefined) {
    // recipesAll(id, null, true) retorna receitas incluindo as que precisam de mesa
    // 'true' como craftingTable = truthy, filtra por !requiresTable || craftingTable
    const recipes = (bot.recipesAll as (id: number, meta: null, table: boolean) => Array<{
      delta?: Array<{ id: number; count: number }>;
      requiresTable?: boolean;
    }>)(itemId, null, true)

    if (recipes.length > 0) {
      // Tentar cada receita até encontrar uma resolúvel (Pitfall 3: múltiplas variantes)
      for (const recipe of recipes) {
        const recipeResult = resolveRecipe(targetItem, itemId, recipe, bot, memo, depth, basePriority, now)
        if (recipeResult !== null && !('unresolvable' in recipeResult)) {
          memo.set(targetItem, recipeResult)
          return recipeResult
        }
      }
      // Todas as receitas falharam: fallback gather
      result = buildGatherResult(targetItem, basePriority, now)
      memo.set(targetItem, result)
      return result
    }
  }

  // 5. Fallback gather (D-05): item sem receita → sub-goal gather:itemId
  result = buildGatherResult(targetItem, basePriority, now)
  memo.set(targetItem, result)
  return result
}

// ---------------------------------------------------------------------------
// Helpers privados
// ---------------------------------------------------------------------------

/** Constrói resultado de fallback gather para um item sem receita. */
function buildGatherResult(targetItem: string, basePriority: number, now: number): DagResult {
  const gatherGoal: Goal = {
    id: `gather:${targetItem}`,
    kind: 'gather',
    priority: basePriority,
    progress: 0,
    dependsOn: [],
    source: 'need',
    committedAt: now,
  }
  return [gatherGoal]
}

/**
 * Resolve uma receita específica, retornando a lista de sub-goals em ordem topológica
 * ou null se a receita não pode ser resolvida.
 */
function resolveRecipe(
  targetItem: string,
  _itemId: number,
  recipe: { delta?: Array<{ id: number; count: number }>; requiresTable?: boolean },
  bot: Bot,
  memo: Map<string, DagResult>,
  depth: number,
  basePriority: number,
  now: number,
): DagResult | null {
  // Extrair ingredientes via recipe.delta (Code Example 2)
  const delta = recipe.delta ?? []
  const ingredientIds = delta
    .filter(d => d.count < 0) // consumidos = ingredientes
    .map(d => d.id)

  // Deduplicate ingredientes (Pitfall 3)
  const uniqueIngredientIds = [...new Set(ingredientIds)]

  // Mapear IDs para nomes
  const ingredientNames = uniqueIngredientIds
    .map(id => (bot.registry.items as Record<number, { name: string } | undefined>)[id]?.name)
    .filter((name): name is string => name !== undefined)

  // Resolver recursivamente cada ingrediente
  const allSubGoals: Goal[] = []
  for (const ingredient of ingredientNames) {
    const subResult = resolveDag(ingredient, bot, memo, depth + 1, basePriority, now)
    if ('unresolvable' in subResult) {
      return null // este ingrediente é irresolúvel — tentar próxima receita
    }
    // Adicionar sub-goals sem duplicatas (mesmo item pode ser resolvido antes)
    for (const g of subResult) {
      if (!allSubGoals.some(existing => existing.id === g.id)) {
        allSubGoals.push(g)
      }
    }
  }

  // Garantir sub-goals extras necessários
  const ensureGoals: Goal[] = []

  // Pitfall 2: requiresTable=true → adicionar ensure:crafting_table ANTES do craft
  if (recipe.requiresTable) {
    const ensureId = 'ensure:crafting_table'
    if (!allSubGoals.some(g => g.id === ensureId)) {
      ensureGoals.push({
        id: ensureId,
        kind: 'ensure',
        priority: basePriority,
        progress: 0,
        dependsOn: [],
        source: 'need',
        committedAt: now,
      })
    }
  }

  // Goal do item-alvo: depende de todos os sub-goals anteriores
  const allPrereqs = [...allSubGoals, ...ensureGoals]
  const lastPrereqIds = allPrereqs.map(g => g.id)

  const craftGoal: Goal = {
    id: `craft:${targetItem}`,
    kind: 'craft',
    priority: basePriority,
    progress: 0,
    dependsOn: lastPrereqIds,
    source: 'need',
    committedAt: now,
  }

  return [...allSubGoals, ...ensureGoals, craftGoal]
}
