// src/skills/index.ts
// Registry centralizado de skills — exposto para o loop cognitivo (Fase 2+)
// D-11: skills acessíveis tanto como funções quanto como tool descriptors com schemas Zod
import type { Bot } from 'mineflayer'

// Re-exportar individualmente para uso direto
export { navigate, NavigateSchema, navigateTool } from './navigate'
export { dig, DigSchema, digTool } from './dig'
export { follow, FollowSchema, followTool } from './follow'
export { attack, AttackSchema, attackTool } from './attack'
export { executeWithSafety, gaussianDelay, SkillTimeoutError, SkillStuckError } from './executor'

/** Função de skill genérica */
export type SkillFunction = (bot: Bot, params: unknown) => Promise<void>

/** Descriptor de uma skill com schema Zod e função de execução */
export interface SkillTool {
  readonly name: string
  readonly description: string
  readonly schema: { parse: (data: unknown) => unknown; toJSONSchema: () => object }
  readonly execute: SkillFunction
}

/**
 * Registry de skills como funções TypeScript.
 * Fase 2 usa para executar skills por nome no loop cognitivo.
 */
export const skillRegistry: Record<string, SkillFunction> = {
  navigate: async (bot, params) => { const { navigate } = await import('./navigate'); return navigate(bot, params) },
  dig: async (bot, params) => { const { dig } = await import('./dig'); return dig(bot, params) },
  follow: async (bot, params) => { const { follow } = await import('./follow'); return follow(bot, params) },
  attack: async (bot, params) => { const { attack } = await import('./attack'); return attack(bot, params) },
}

/**
 * Registry de tool descriptors para o LangGraph (Fase 3).
 * Contém schemas Zod prontos para `.toJSONSchema()` (Zod v4 built-in).
 * D-11: Fase 3 consome isso sem nenhuma refatoração.
 */
import { navigateTool } from './navigate'
import { digTool } from './dig'
import { followTool } from './follow'
import { attackTool } from './attack'

export const toolRegistry: SkillTool[] = [
  navigateTool,
  digTool,
  followTool,
  attackTool,
]
