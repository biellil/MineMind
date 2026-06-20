// src/skills/index.ts
// Registry centralizado de skills — exposto para o loop cognitivo (Fase 2+)
// D-11: skills acessíveis tanto como funções quanto como tool descriptors com schemas Zod
import type { Bot } from 'mineflayer'
import type { SkillResult } from '../grounding/types'
import { navigate, navigateTool } from './navigate'
import { dig, digTool } from './dig'
import { follow, followTool } from './follow'
import { attack, attackTool } from './attack'
import { eat, eatTool } from './eat'
import { flee, fleeTool } from './flee'
import { shelter, shelterTool } from './shelter'

// Re-exportar individualmente para uso direto
export { navigate, NavigateSchema, navigateTool } from './navigate'
export { dig, DigSchema, digTool } from './dig'
export { follow, FollowSchema, followTool } from './follow'
export { attack, AttackSchema, attackTool } from './attack'
export { eat, EatSchema, eatTool } from './eat'
export { flee, FleeSchema, fleeTool } from './flee'
export { shelter, ShelterSchema, shelterTool } from './shelter'
export { executeWithSafety, gaussianDelay, SkillTimeoutError, SkillStuckError } from './executor'
// Fase 7: contrato de retorno das skills, re-exportado para conveniência dos consumidores.
export type { SkillResult } from '../grounding/types'

/** Função de skill genérica — Fase 7: SEMPRE resolve com SkillResult (nunca lança como fluxo). */
export type SkillFunction = (bot: Bot, params: unknown) => Promise<SkillResult>

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
 * Uses static imports (no dynamic import() overhead per call).
 */
export const skillRegistry: Record<string, SkillFunction> = {
  navigate,
  dig,
  follow,
  attack,
  eat,
  flee,
  shelter,
}

/**
 * Registry de tool descriptors para o LangGraph (Fase 3).
 * Contém schemas Zod prontos para `.toJSONSchema()` (Zod v4 built-in).
 * D-11: Fase 3 consome isso sem nenhuma refatoração.
 */
export const toolRegistry: SkillTool[] = [
  navigateTool,
  digTool,
  followTool,
  attackTool,
  eatTool,
  fleeTool,
  shelterTool,
]
