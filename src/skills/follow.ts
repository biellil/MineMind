// src/skills/follow.ts
// D-12: stub — Fase 1 não implementa follow real (alta superfície de falha)
import { z } from 'zod'
import type { Bot } from 'mineflayer'

export const FollowSchema = z.object({
  entityName: z.string().max(64).describe('Nome do jogador ou entidade a seguir'),
  maxDistance: z.number().min(1).max(32).default(3)
    .describe('Distância máxima a manter do alvo em blocos'),
})

export type FollowParams = z.infer<typeof FollowSchema>

/** Stub — implementação real na Fase 2+ */
export async function follow(_bot: Bot, rawParams: unknown): Promise<void> {
  FollowSchema.parse(rawParams)  // valida params mesmo como stub
  throw new Error('Skill follow não implementada na Fase 1 (stub). Será implementada na Fase 2.')
}

export const followTool = {
  name: 'follow',
  description: '[STUB] Segue um jogador ou entidade mantendo distância configurada. Não implementado na Fase 1.',
  schema: FollowSchema,
  execute: follow,
} as const
