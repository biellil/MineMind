// src/skills/attack.ts
// D-12: stub — Fase 1 não implementa combate (alta superfície de falha)
import { z } from 'zod'
import type { Bot } from 'mineflayer'
import type { SkillResult } from '../grounding/types'

export const AttackSchema = z.object({
  entityName: z.string().max(64).describe('Nome do jogador ou mob a atacar'),
})

export type AttackParams = z.infer<typeof AttackSchema>

/**
 * Stub — implementação real na Fase 2+.
 * Fase 7 (D-12): contrato uniforme — resolve com SkillResult{outcome:'error'} em vez de lançar.
 * 999.1 D-06: stub NÃO se auto-embrulha em executeWithSafety — não há operação async
 * longa a proteger. Quando o combate real for implementado, deve envolver a operação
 * (ex: pvp/strafing contínuo) em executeWithSafety com timeout próprio.
 */
export async function attack(_bot: Bot, rawParams: unknown): Promise<SkillResult> {
  AttackSchema.parse(rawParams)  // valida params mesmo como stub
  return { outcome: 'error', observed: 0, expected: 0, delta: {}, reason: 'skill attack não implementada (stub)' }
}

export const attackTool = {
  name: 'attack',
  description: '[STUB] Ataca um jogador ou mob. Não implementado na Fase 1.',
  schema: AttackSchema,
  execute: attack,
} as const
