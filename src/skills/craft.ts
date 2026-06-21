// src/skills/craft.ts
// Plan 09-03 / Task 2 / CRAFT-01/02 / D-15/D-18: craft(itemName, count) resolve a receita
// internamente (2x2 sem mesa → bancada 3x3 via ensureStation), aplica o GATE DE MESA (no_effect SEM
// deixar bot.craft lançar — Pitfall 4) e é GROUNDED pelo delta de inventário (evaluateCraft, D-18).
//
// Pitfall 4 (chave): bot.craft(recipe, count, table) LANÇA "Recipe requires craftingTable, but one
// was not supplied" se recipe.requiresTable e nenhuma mesa — por isso o gate D-15 #3 retorna
// no_effect ANTES de chamar bot.craft (não polui o sinal de grounding com 'error').
// Pitfall 5: nome→id sempre via bot.registry.itemsByName[name].id (NUNCA type numérico mágico).
import { z } from 'zod'
import type { Bot } from 'mineflayer'
import type { Block } from 'prismarine-block'
import type { SkillResult } from '../grounding/types'
import { executeWithSafety } from './executor'
import { captureGroundState } from '../grounding/capture'
import { evaluateCraft } from '../grounding/evaluate'
import { ensureStation } from './station'
import { config } from '../config'

/** Schema Zod do skill craft (D-11). */
export const CraftSchema = z.object({
  itemName: z.string().max(64).describe('Nome do item a craftar (ex: stick, crafting_table, wooden_pickaxe)'),
  count: z.number().int().min(1).max(64).default(1).describe('Quantidade a craftar (1-64, padrão 1)'),
})

export type CraftParams = z.infer<typeof CraftSchema>

/**
 * Crafta um item por nome+quantidade (D-15). Resolve a receita (2x2 → bancada), gate de mesa
 * (no_effect sem deixar bot.craft lançar) e grounding por delta de inventário (D-18).
 *
 * @param bot       instância Mineflayer.
 * @param rawParams params não validados (signal de runtime extraído antes do Zod).
 */
export async function craft(bot: Bot, rawParams: unknown): Promise<SkillResult> {
  // Extrair signal ANTES do Zod (injeção de runtime — padrão dig.ts).
  const signal = (rawParams as Record<string, unknown>)?.signal as AbortSignal | undefined
  const { itemName, count } = CraftSchema.parse(rawParams)

  const before = captureGroundState(bot)

  // Pitfall 5: nome→id via registry (NUNCA type numérico mágico).
  const id = bot.registry.itemsByName[itemName]?.id
  if (id === undefined) {
    return { outcome: 'no_effect', observed: 0, expected: count, delta: {}, reason: 'item desconhecido no registry' }
  }

  // (1) 2x2: table=null → SÓ receitas executáveis sem mesa (filtra por inventário).
  let recipes = bot.recipesFor(id, null, count, null)
  let table: Block | null = null

  // (2) se vazio, tenta com bancada (posiciona/localiza via ensureStation).
  if (recipes.length === 0) {
    table = await ensureStation(bot, 'crafting_table', signal)
    if (table) recipes = bot.recipesFor(id, null, count, table)
  }

  // (3) gate D-15 #3 (Pitfall 4): sem receita executável → no_effect ANTES de chamar bot.craft
  // (evita o throw "Recipe requires craftingTable" que viraria 'error' no execute node).
  if (recipes.length === 0) {
    return { outcome: 'no_effect', observed: 0, expected: count, delta: {}, reason: 'sem receita executável (falta ingrediente ou bancada)' }
  }

  const recipe = recipes[0]

  // (4) executa embrulhado em executeWithSafety; nunca propaga o throw como fluxo (D-12).
  let threw: unknown = null
  try {
    await executeWithSafety(() => bot.craft(recipe, count, table ?? undefined), {
      timeoutMs: config.navigateTimeoutMs, // teto: craft é rápido, mas ensureStation pode ter navegado
      signal,
    })
  } catch (e) {
    threw = e
  }

  const after = captureGroundState(bot)
  const expected = recipe.result.count * count // D-18: o ganho esperado é result.count * count
  return evaluateCraft(before, after, itemName, expected, threw)
}

/** Tool descriptor para LangGraph (D-11). Registrado no index.ts (Task 3). */
export const craftTool = {
  name: 'craft',
  description:
    'Crafta um item por nome+quantidade; resolve a receita (2x2 ou bancada 3x3) e posiciona a bancada se necessário',
  schema: CraftSchema,
  execute: craft,
} as const
