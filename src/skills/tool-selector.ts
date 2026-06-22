// src/skills/tool-selector.ts — D-14 Fase 10
// Exporta selectToolFor com ranking por tier (D-12), substituindo a versão binária de equip.ts.
// A tabela TOOL_TIER e o mapeamento blockName→toolCategory ficam aqui (decisão D-14 do usuário).
//
// equip.ts CATEGORY_PATTERNS usa regex sobre nome de ferramenta (/_pickaxe$/, /_axe$/, etc.).
// Este módulo duplica matchesCategory inline (não exportada em equip.ts) e adiciona um mapeamento
// de nome de BLOCO para categoria de ferramenta (ex: 'iron_ore' → 'pickaxe', 'oak_log' → 'axe').
import type { Bot } from 'mineflayer'
import type { Item } from 'prismarine-item'

/**
 * Tier de ferramenta por material (D-12 Fase 10).
 * Ranking estático: wooden=1 < stone=2 < iron=3 < diamond=4 < netherite=5.
 * Verificado via minecraft-data 1.21.4 (RESEARCH.md Pattern 3).
 */
export const TOOL_TIER: Record<string, number> = {
  wooden_pickaxe: 1, wooden_axe: 1, wooden_shovel: 1, wooden_sword: 1, wooden_hoe: 1,
  stone_pickaxe:  2, stone_axe:  2, stone_shovel:  2, stone_sword:  2, stone_hoe:  2,
  iron_pickaxe:   3, iron_axe:   3, iron_shovel:   3, iron_sword:   3, iron_hoe:   3,
  diamond_pickaxe: 4, diamond_axe: 4, diamond_shovel: 4, diamond_sword: 4, diamond_hoe: 4,
  netherite_pickaxe: 5, netherite_axe: 5, netherite_shovel: 5, netherite_sword: 5, netherite_hoe: 5,
  // Ferramentas especiais de referência (sem tier de material)
  golden_pickaxe: 2, golden_axe: 2, golden_shovel: 2, golden_sword: 2, golden_hoe: 2,
}

/** Padrões de categoria (espelhado de equip.ts — matchesCategory não está exportada). */
const CATEGORY_PATTERNS: Record<string, RegExp> = {
  pickaxe: /_pickaxe$/,
  weapon: /_(sword|axe)$/,
  axe: /_axe$/,
  shovel: /_shovel$/,
}

/** True se o nome do item pertence à categoria (espelha equip.ts). */
function matchesCategory(name: string, category: string): boolean {
  const re = CATEGORY_PATTERNS[category]
  return re ? re.test(name) : false
}

/**
 * Mapeamento de nome de BLOCO para categoria de ferramenta eficaz.
 * Usado pelo guard D-13 em dig.ts: blockName (ex: 'iron_ore') → 'pickaxe'.
 * Baseado nos materiais efetivos do Minecraft 1.21.4.
 */
const BLOCK_TO_TOOL_CATEGORY: Record<string, string> = {
  // Madeiras — machado
  oak_log: 'axe', birch_log: 'axe', spruce_log: 'axe', jungle_log: 'axe',
  acacia_log: 'axe', dark_oak_log: 'axe', mangrove_log: 'axe', cherry_log: 'axe',
  oak_wood: 'axe', birch_wood: 'axe', spruce_wood: 'axe', jungle_wood: 'axe',
  oak_planks: 'axe', birch_planks: 'axe', spruce_planks: 'axe', jungle_planks: 'axe',
  crafting_table: 'axe', chest: 'axe', bookshelf: 'axe',
  // Pedra, minérios e pedras — picareta
  stone: 'pickaxe', cobblestone: 'pickaxe', granite: 'pickaxe', diorite: 'pickaxe',
  andesite: 'pickaxe', deepslate: 'pickaxe', calcite: 'pickaxe', tuff: 'pickaxe',
  iron_ore: 'pickaxe', copper_ore: 'pickaxe', gold_ore: 'pickaxe', coal_ore: 'pickaxe',
  diamond_ore: 'pickaxe', emerald_ore: 'pickaxe', lapis_ore: 'pickaxe', redstone_ore: 'pickaxe',
  deepslate_iron_ore: 'pickaxe', deepslate_gold_ore: 'pickaxe', deepslate_diamond_ore: 'pickaxe',
  deepslate_coal_ore: 'pickaxe', deepslate_copper_ore: 'pickaxe',
  sand: 'shovel', gravel: 'shovel', dirt: 'shovel', grass_block: 'shovel',
  clay: 'shovel', soul_sand: 'shovel', mycelium: 'shovel',
}

/**
 * Converte nome de bloco para categoria de ferramenta.
 * Retorna null se o bloco não tem categoria conhecida (ex: água, folhagem).
 */
export function blockToolCategory(blockName: string): string | null {
  return BLOCK_TO_TOOL_CATEGORY[blockName] ?? null
}

/**
 * True SOMENTE quando o bloco não dropa NADA sem a ferramenta correta — ou seja,
 * blocos de categoria 'pickaxe' (pedra, minérios, deepslate, etc.).
 *
 * Em Minecraft, madeira ('axe') e terra/areia/cascalho ('shovel') são quebráveis À MÃO
 * (a ferramenta só acelera). Apenas blocos de picareta exigem a ferramenta p/ dropar.
 *
 * Usado pelo guard de dig.ts: o hard-gate de "sem ferramenta → no_effect" só vale aqui.
 * Conserta o deadlock de bootstrap (precisar de axe p/ coletar a madeira que CRAFTA o axe).
 *
 * @param blockName nome do bloco (ex: 'oak_log', 'iron_ore')
 * @returns true se o bloco exige ferramenta p/ qualquer drop; false caso contrário (inclui desconhecidos)
 */
export function toolRequiredForDrop(blockName: string): boolean {
  return BLOCK_TO_TOOL_CATEGORY[blockName] === 'pickaxe'
}

/**
 * Seleciona a ferramenta de MAIOR tier disponível no inventário para a categoria dada (D-12 Fase 10).
 *
 * Aceita como `category` tanto uma categoria de ferramenta (ex: 'pickaxe', 'axe') quanto um nome
 * de bloco (ex: 'iron_ore', 'oak_log') — o lookup usa BLOCK_TO_TOOL_CATEGORY internamente.
 *
 * D-12 Fase 10: substitui a versão binária (find) por reduce com TOOL_TIER para retornar a
 * ferramenta de maior tier disponível. Se nenhuma ferramenta compatível → retorna null (D-13).
 *
 * @param bot      instância do bot (precisa de inventory.items())
 * @param category categoria de ferramenta OU nome de bloco
 * @returns Item de maior tier ou null se nenhum encontrado
 */
export function selectToolFor(bot: Bot, category: string): Item | null {
  // Resolve nome de bloco para categoria de ferramenta se necessário
  const resolvedCategory = CATEGORY_PATTERNS[category] !== undefined
    ? category
    : (BLOCK_TO_TOOL_CATEGORY[category] ?? category)

  const items = bot.inventory.items().filter((it) => matchesCategory(it.name, resolvedCategory))
  if (items.length === 0) return null

  // D-12: retorna a ferramenta de maior tier disponível (Fase 9: binário; Fase 10: ranqueado)
  return items.reduce((best, it) => {
    const tierBest = TOOL_TIER[best.name] ?? 0
    const tierIt   = TOOL_TIER[it.name]   ?? 0
    return tierIt > tierBest ? it : best
  })
}
