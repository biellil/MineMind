// src/skills/equip.ts
// CRAFT-04 / D-16/D-17/D-19: equip como verbo de 1ª classe (B1) + selectToolFor (B2).
//
// Grounding LOCAL (D-19/Pitfall 2): equipar NÃO muda contagem de inventário, então a verdade é
// `bot.heldItem` (mão) ou `bot.inventory.slots[...]` (armadura/off-hand) — NUNCA delta de inventário.
// NÃO usar captureGroundState/inventoryDelta aqui (seria sempre no_effect).
//
// Heurística binária por categoria (D-17): tem pickaxe? equipa. sword/axe? equipa. SEM ranking por
// tier (madeira<pedra<ferro<diamante) — isso é Fase 10 (troca o `find` por seletor ranqueado
// mantendo este ponto de chamada).
import { z } from 'zod'
import type { Bot } from 'mineflayer'
import type { Item } from 'prismarine-item'
import type { SkillResult } from '../grounding/types'
import { evaluateEquip } from '../grounding/evaluate'

/** Schema Zod do skill equip (D-11). destination opcional (padrão 'hand'). */
export const EquipSchema = z.object({
  itemName: z.string().max(64).describe('Nome do item a equipar (ferramenta/armadura/bloco)'),
  destination: z
    .enum(['hand', 'head', 'torso', 'legs', 'feet', 'off-hand'])
    .optional()
    .describe('Slot de destino (padrão hand)'),
})

export type EquipParams = z.infer<typeof EquipSchema>

/** Categorias de ferramenta (D-17, binário — SEM tier). */
export type ToolCategory = 'pickaxe' | 'weapon' | 'axe' | 'shovel'

/**
 * Padrões por categoria. Binário: o nome do item bate o regex da categoria ou não.
 * `weapon` = arma de corpo-a-corpo (sword/axe) para o pré-flight de attack.
 */
const CATEGORY_PATTERNS: Record<string, RegExp> = {
  pickaxe: /_pickaxe$/,
  weapon: /_(sword|axe)$/, // arma de corpo-a-corpo p/ attack
  axe: /_axe$/,
  shovel: /_shovel$/,
}

/** True se o nome do item pertence à categoria (binário, sem tier). */
function matchesCategory(name: string, category: string): boolean {
  const re = CATEGORY_PATTERNS[category]
  return re ? re.test(name) : false
}

/**
 * Seleciona a primeira ferramenta do inventário que bate a categoria (D-17, binário).
 *
 * NÃO ranqueia por tier — retorna o PRIMEIRO match na ordem do inventário, qualquer que seja.
 * O ranking por tier (madeira<pedra<ferro<diamante) é Fase 10: troca o `find` por um seletor
 * ranqueado mantendo este mesmo ponto de chamada (selectToolFor) intacto.
 *
 * @param bot      instância do bot (precisa de inventory.items())
 * @param category categoria de ferramenta ('pickaxe' | 'weapon' | ...)
 * @returns o Item correspondente ou null
 */
export function selectToolFor(bot: Bot, category: string): Item | null {
  return bot.inventory.items().find((it) => matchesCategory(it.name, category)) ?? null
}

/** Mapa slot de armadura → índice em bot.inventory.slots (D-19/Pitfall 2). */
const ARMOR_SLOT: Record<string, number> = { head: 5, torso: 6, legs: 7, feet: 8 }

/**
 * Equipa um item do inventário no slot indicado (mão por padrão). Verbo de 1ª classe (B1/D-16).
 *
 * Grounding LOCAL (D-19/Pitfall 2): o outcome deriva do estado LOCAL pós-ação (heldItem para mão,
 * inventory.slots[...] para armadura/off-hand), NÃO de delta de inventário. NUNCA lança como fluxo
 * (D-12): exceção de bot.equip vira reason anexado e o estado LOCAL decide o outcome.
 *
 * @param bot       instância do bot (precisa de inventory/heldItem após spawn)
 * @param rawParams parâmetros não validados (só o signal de runtime é injeção externa)
 */
export async function equip(bot: Bot, rawParams: unknown): Promise<SkillResult> {
  // Extrair signal ANTES do Zod (injeção de runtime, não faz parte do schema). Não há ação longa
  // aqui — mantemos o padrão para consistência com as demais skills.
  const signal = (rawParams as Record<string, unknown>)?.signal as AbortSignal | undefined
  void signal

  const { itemName, destination } = EquipSchema.parse(rawParams)

  const item = bot.inventory.items().find((i) => i.name === itemName)
  if (!item) {
    return { outcome: 'no_effect', observed: 0, expected: 1, delta: {}, reason: 'item ausente' }
  }

  const dest = destination ?? 'hand'

  let threw: unknown = null
  try {
    await bot.equip(item, dest)
  } catch (e) {
    threw = e
  }

  // Verdade LOCAL (D-19/Pitfall 2): "está equipado?" pelo estado pós-ação, não por delta.
  const equipped =
    dest === 'hand'
      ? bot.heldItem?.name === itemName
      : dest === 'off-hand'
        ? bot.inventory.slots[45]?.name === itemName
        : bot.inventory.slots[ARMOR_SLOT[dest]]?.name === itemName

  const result = evaluateEquip(!!equipped)
  return threw
    ? { ...result, reason: threw instanceof Error ? threw.message : String(threw) }
    : result
}

/** Tool descriptor para LangGraph (D-11). NÃO registrado no index aqui (Plano 03 registra os 4). */
export const equipTool = {
  name: 'equip',
  description:
    'Equipa uma ferramenta/armadura/bloco do inventário no slot indicado (mão por padrão)',
  schema: EquipSchema,
  execute: equip,
} as const
