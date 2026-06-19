// src/skills/dig.ts
// ACT-02: mineração/coleta de bloco-alvo via mineflayer-collectblock
import { z } from 'zod'
import type { Bot } from 'mineflayer'
import 'mineflayer-collectblock'  // side-effect import for Bot type augmentation (adds bot.collectBlock)
import { executeWithSafety } from './executor'
import { config } from '../config'

export const DigSchema = z.object({
  target: z.union([
    z.object({
      x: z.number().describe('Coordenada X do bloco'),
      y: z.number().describe('Coordenada Y do bloco'),
      z: z.number().describe('Coordenada Z do bloco'),
    }).describe('Posição absoluta do bloco a minerar'),
    z.string().max(64).describe('Tipo de bloco a coletar (ex: "oak_log", "coal_ore") — coleta o mais próximo'),
  ]).describe('Alvo de mineração: posição específica ou tipo de bloco'),
  count: z.number().int().min(1).max(64).default(1)
    .describe('Quantidade de blocos a coletar (1–64, padrão 1)'),
})

export type DigParams = z.infer<typeof DigSchema>

/**
 * Minera/coleta um bloco-alvo.
 * ACT-02: usa mineflayer-collectblock para encontrar, navegar, equipar ferramenta e minerar.
 * ACT-03: executor centralizado aplica timeout de 10s e watchdog de inventário.
 */
export async function dig(bot: Bot, rawParams: unknown): Promise<void> {
  const { target, count } = DigSchema.parse(rawParams)

  if (typeof target === 'string') {
    // Coletar blocos pelo nome usando mineflayer-collectblock
    // CollectOptions não tem `count` — passamos array de blocos para coletar múltiplos
    const blocks = bot.findBlocks({
      matching: (b) => b.name === target,
      maxDistance: config.perceptionRadius,
      count,
    }).map((pos) => bot.blockAt(pos)).filter((b): b is NonNullable<typeof b> => b !== null && b.type !== 0)

    if (blocks.length === 0) {
      throw new Error(`Bloco do tipo '${target}' não encontrado no raio de ${config.perceptionRadius} blocos`)
    }

    await executeWithSafety(
      () => bot.collectBlock.collect(blocks),
      {
        timeoutMs: config.digTimeoutMs * count,  // timeout proporcional à quantidade
        // Watchdog: inventário que cresce indica progresso
        progressChecker: () => bot.inventory.items().reduce((sum, item) => sum + item.count, 0),
        progressIntervalMs: 2_000,
        noProgressToleranceMs: config.digTimeoutMs,
      }
    )
  } else {
    // Minerar bloco em posição específica
    const blockAtPos = bot.blockAt({ x: target.x, y: target.y, z: target.z } as Parameters<typeof bot.blockAt>[0])
    if (!blockAtPos || blockAtPos.type === 0) {
      throw new Error(`Nenhum bloco em (${target.x}, ${target.y}, ${target.z}) ou é ar`)
    }

    await executeWithSafety(
      () => bot.dig(blockAtPos),
      {
        timeoutMs: config.digTimeoutMs,
        progressIntervalMs: 1_000,
        noProgressToleranceMs: config.digTimeoutMs,
      }
    )
  }
}

export const digTool = {
  name: 'dig',
  description: 'Minera ou coleta um bloco. Pode receber posição absoluta XYZ ou nome do tipo de bloco para coletar o mais próximo.',
  schema: DigSchema,
  execute: dig,
} as const
