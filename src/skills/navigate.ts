// src/skills/navigate.ts
// ACT-01: navegação autônoma via mineflayer-pathfinder
// D-11: schema Zod implementado agora para Fase 3 consumir sem refatoração
import { z } from 'zod'
import type { Bot } from 'mineflayer'
import { goals } from 'mineflayer-pathfinder'
import { executeWithSafety } from './executor'
import { config } from '../config'

/** Schema Zod do skill navigate (D-11) — consumido pelo LangGraph na Fase 3 */
export const NavigateSchema = z.object({
  target: z.union([
    z.object({
      x: z.number().describe('Coordenada X absoluta'),
      y: z.number().describe('Coordenada Y absoluta'),
      z: z.number().describe('Coordenada Z absoluta'),
    }).describe('Coordenadas absolutas no mundo'),
    z.string().max(64).describe('Nome do tipo de bloco para navegar até o mais próximo (ex: "oak_log", "diamond_ore")'),
  ]).describe('Destino de navegação: coordenadas XYZ ou nome de tipo de bloco'),
  range: z.number().min(1).max(10).default(2)
    .describe('Distância tolerada do alvo em blocos (1–10, padrão 2)'),
})

export type NavigateParams = z.infer<typeof NavigateSchema>

/**
 * Navega até uma posição XYZ ou até o bloco do tipo especificado mais próximo.
 * ACT-01: usa mineflayer-pathfinder com timeout e watchdog via executor centralizado.
 * PITFALL 2: pathfinder.goto sem timeout pode travar — executor resolve isso.
 *
 * @param bot - Instância do bot (deve ter pathfinder carregado após spawn)
 * @param rawParams - Parâmetros não validados (validados via Zod antes de usar)
 */
export async function navigate(bot: Bot, rawParams: unknown): Promise<void> {
  const { target, range } = NavigateSchema.parse(rawParams)

  let goal: goals.Goal

  if (typeof target === 'string') {
    // Navegar até o bloco do tipo especificado mais próximo
    const block = bot.findBlock({
      matching: (b) => b.name === target,
      maxDistance: config.perceptionRadius * 2,  // busca no dobro do raio de percepção
    })
    if (!block) {
      throw new Error(`Bloco do tipo '${target}' não encontrado no raio de ${config.perceptionRadius * 2} blocos`)
    }
    goal = new goals.GoalNear(block.position.x, block.position.y, block.position.z, range)
  } else {
    goal = new goals.GoalNear(target.x, target.y, target.z, range)
  }

  // ACT-03: executor centralizado aplica timeout de 30s e watchdog de posição
  await executeWithSafety(
    () => bot.pathfinder.goto(goal),
    {
      timeoutMs: config.navigateTimeoutMs,  // 30000ms padrão
      // Watchdog: posição que não muda indica bot preso
      progressChecker: () => {
        const pos = bot.entity.position
        return Math.round(pos.x * 10) + Math.round(pos.y * 10) * 1000 + Math.round(pos.z * 10) * 1_000_000
      },
      progressIntervalMs: 2_000,
      noProgressToleranceMs: 10_000,
    }
  )
}

/** Tool descriptor para LangGraph Fase 3 (D-11) */
export const navigateTool = {
  name: 'navigate',
  description: 'Navega até uma posição XYZ absoluta ou até o bloco do tipo especificado mais próximo no mundo',
  schema: NavigateSchema,
  execute: navigate,
} as const
