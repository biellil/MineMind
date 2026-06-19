// src/skills/attack.ts
// D-12: stub — Fase 1 não implementa combate (alta superfície de falha)
import { z } from 'zod'
import type { Bot } from 'mineflayer'

export const AttackSchema = z.object({
  entityName: z.string().max(64).describe('Nome do jogador ou mob a atacar'),
})

export type AttackParams = z.infer<typeof AttackSchema>

/**
 * Stub — implementação real na Fase 2+.
 * 999.1 D-06: stub NÃO se auto-embrulha em executeWithSafety — não há operação async
 * longa a proteger (lança imediatamente). Quando o combate real for implementado, deve
 * envolver a operação (ex: pvp/strafing contínuo) em executeWithSafety com timeout próprio.
 */
export async function attack(_bot: Bot, rawParams: unknown): Promise<void> {
  AttackSchema.parse(rawParams)  // valida params mesmo como stub
  throw new Error('Skill attack não implementada na Fase 1 (stub). Será implementada em fase futura.')
}

export const attackTool = {
  name: 'attack',
  description: '[STUB] Ataca um jogador ou mob. Não implementado na Fase 1.',
  schema: AttackSchema,
  execute: attack,
} as const
