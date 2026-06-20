// src/skills/attack.ts
// SURV-02 (defesa) / D-15: golpe defensivo 1-shot via primitiva nativa bot.attack.
import { z } from 'zod'
import type { Bot } from 'mineflayer'
import type { SkillResult } from '../grounding/types'

export const AttackSchema = z.object({
  entityName: z.string().max(64).describe('Nome do jogador ou mob a atacar'),
})

export type AttackParams = z.infer<typeof AttackSchema>

/**
 * Dá UM golpe defensivo no alvo nomeado mais próximo (D-15, 1-shot).
 *
 * Sem perseguir, sem manter alvo, sem pathfinder: golpeia apenas se o alvo já está
 * ao alcance/visível. Combate real (manter alvo, recuar, kiting) = Fase 13.
 *
 * Fase 7 (D-08/D-12): SEMPRE resolve com SkillResult grounded — alvo encontrado vira
 * success/observed:1; alvo ausente vira no_effect (não throw).
 *
 * @param bot - Instância do bot
 * @param rawParams - Parâmetros não validados (validados via Zod)
 */
export async function attack(bot: Bot, rawParams: unknown): Promise<SkillResult> {
  const { entityName } = AttackSchema.parse(rawParams)
  // D-15: 1-shot defensivo — encontra o alvo nomeado mais próximo e dá UM golpe. Sem perseguir,
  // sem manter alvo, sem pathfinder. Combate real (manter alvo/recuar/kiting) = Fase 13.
  const target = bot.nearestEntity(
    (e) => e.name === entityName || (e as { username?: string }).username === entityName,
  )
  if (!target) {
    return { outcome: 'no_effect', observed: 0, expected: 1, delta: {}, reason: `alvo '${entityName}' não encontrado` }
  }
  bot.attack(target) // index.d.ts:345 — void, golpe único
  return { outcome: 'success', observed: 1, expected: 1, delta: {} }
}

export const attackTool = {
  name: 'attack',
  description: 'Dá um golpe defensivo único em um jogador ou mob (1-shot, sem perseguir)',
  schema: AttackSchema,
  execute: attack,
} as const
