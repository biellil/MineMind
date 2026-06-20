// src/skills/eat.ts
// SURV-01 / D-05: skill reflexa `eat` — equipa a melhor comida, consome, re-equipa o item
// anterior. Grounded por delta REAL de bot.food (Pitfall 2: grounding vital LOCAL, NÃO mexer
// no GroundState genérico). Zero dependência nova — tudo via API nativa Mineflayer.
//
// Fase 7 (D-08/D-12): SEMPRE resolve com SkillResult — nunca lança como fluxo. Falha no
// consume vira reason anexado; o outcome deriva do delta observado, não da Promise.
import { z } from 'zod'
import type { Bot } from 'mineflayer'
import type { Item } from 'prismarine-item'
import type { SkillResult } from '../grounding/types'

/** Schema Zod do skill eat (D-11). eat não precisa de params além do signal de runtime. */
export const EatSchema = z.object({})

export type EatParams = z.infer<typeof EatSchema>

/**
 * Come a melhor comida disponível no inventário (reflexo de sobrevivência, SURV-01/D-05).
 *
 * Fluxo: salva heldItem → seleciona comida de maior foodPoints (∩ bot.registry.foods) →
 * equip(food,'hand') → consume() → re-equipa o item anterior. Grounded por `bot.food`
 * antes/depois: outcome = success se ganhou food, no_effect caso contrário.
 *
 * Abort (D-05): se o signal já está abortado, retorna no_effect sem comer; se abortar durante
 * a mastigação, desativa o item para cancelar e o delta real decide o outcome.
 *
 * @param bot - Instância do bot (precisa de inventory/registry.foods após spawn)
 * @param rawParams - Parâmetros não validados (só o signal de runtime importa)
 */
export async function eat(bot: Bot, rawParams: unknown): Promise<SkillResult> {
  // Extrair signal ANTES do Zod (injeção de runtime, não faz parte do schema — padrão navigate.ts)
  const signal = (rawParams as Record<string, unknown>)?.signal as AbortSignal | undefined
  EatSchema.parse(rawParams ?? {})

  const foodBefore = bot.food
  const prevHeld = bot.heldItem

  // Seleção de comida: itens do inventário que estão em registry.foods, ordenados por foodPoints desc.
  const foods = bot.inventory
    .items()
    .filter((it) => bot.registry.foods?.[it.type])
    .sort((a, b) => bot.registry.foods[b.type].foodPoints - bot.registry.foods[a.type].foodPoints)
  const food = foods[0] as Item | undefined

  if (!food) {
    return { outcome: 'no_effect', observed: 0, expected: 0, delta: {}, reason: 'sem comida no inventário' }
  }

  // Abort já sinalizado antes de começar: não come.
  if (signal?.aborted) {
    return { outcome: 'no_effect', observed: 0, expected: 0, delta: {}, reason: 'abortado antes de comer' }
  }

  // Abort no meio da mastigação → cancela o consumo (D-05).
  if (signal) {
    signal.addEventListener(
      'abort',
      () => {
        try {
          bot.deactivateItem()
        } catch {
          /* ignora se já não está mastigando */
        }
      },
      { once: true },
    )
  }

  const expected = bot.registry.foods[food.type].foodPoints

  // NUNCA deixar lançar como fluxo (D-12): captura o erro e segue para o grounding.
  let threw: unknown = null
  try {
    await bot.equip(food, 'hand')
    await bot.consume()
  } catch (err) {
    threw = err
  }

  // Re-equipa o item anterior se havia um diferente da comida.
  if (prevHeld && prevHeld.type !== food.type) {
    try {
      await bot.equip(prevHeld, 'hand')
    } catch {
      /* re-equip best-effort; não falha a skill */
    }
  }

  // Grounding vital LOCAL (Pitfall 2): outcome deriva do delta real de bot.food, não da Promise.
  const gained = bot.food - foodBefore
  const outcome = gained > 0 ? 'success' : 'no_effect'
  const observed = Math.max(0, gained)
  const reason = threw ? (threw instanceof Error ? threw.message : String(threw)) : undefined

  return { outcome, observed, expected, delta: {}, reason }
}

/** Tool descriptor para LangGraph (D-11) */
export const eatTool = {
  name: 'eat',
  description: 'Come a melhor comida disponível no inventário (reflexo de sobrevivência)',
  schema: EatSchema,
  execute: eat,
} as const
