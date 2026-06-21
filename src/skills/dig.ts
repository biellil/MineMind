// src/skills/dig.ts
// ACT-02: mineração/coleta de bloco-alvo via mineflayer-collectblock
import { z } from 'zod'
import type { Bot } from 'mineflayer'
import 'mineflayer-collectblock'  // side-effect import for Bot type augmentation (adds bot.collectBlock)
import { goals } from 'mineflayer-pathfinder'
import { executeWithSafety } from './executor'
import { captureGroundState } from '../grounding/capture'
import { evaluateDig } from '../grounding/evaluate'
import type { SkillResult } from '../grounding/types'
import { selectToolFor } from './equip'
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
 *
 * Fase 7 (D-12): SEMPRE retorna SkillResult — pré-condições viram outcome:'no_effect' em vez de throw.
 * Fase 7 (D-08): o delta é lido APÓS o try/catch (roda mesmo se a ação lançar mid-progresso) —
 * um timeout que coletou 3 de 10 reporta observed:3, não falha total.
 */
export async function dig(bot: Bot, rawParams: unknown): Promise<SkillResult> {
  // Extrair signal ANTES do Zod (não faz parte do schema — é injeção de runtime)
  const signal = (rawParams as Record<string, unknown>)?.signal as AbortSignal | undefined
  const { target, count } = DigSchema.parse(rawParams)
  const before = captureGroundState(bot, typeof target === 'string' ? undefined : target)

  // B2/D-16: pré-flight de ferramenta — rede de segurança (o LLM local frequentemente omite equipar).
  // Binário por categoria (D-17, sem tier). Best-effort: falha de equip NÃO aborta o dig (o grounding
  // por delta decide o sucesso real).
  try {
    const tool = selectToolFor(bot, 'pickaxe')
    if (tool && bot.heldItem?.name !== tool.name) await bot.equip(tool, 'hand')
  } catch {
    /* pré-flight best-effort; o grounding por delta decide o sucesso */
  }

  // D-17: AbortSignal honrado via bot.pathfinder.stop()
  if (signal) {
    signal.addEventListener('abort', () => {
      try { bot.pathfinder.stop() } catch { /* ignora se pathfinder já parou */ }
    }, { once: true })
  }

  let threw: unknown = null
  try {
    if (typeof target === 'string') {
      // Coletar blocos pelo nome usando mineflayer-collectblock
      // CollectOptions não tem `count` — passamos array de blocos para coletar múltiplos
      const blocks = bot.findBlocks({
        matching: (b) => b.name === target,
        maxDistance: config.gatherSearchRadius,  // 999.1 D-01: raio de coleta independente de perceptionRadius
        count,
      }).map((pos) => bot.blockAt(pos)).filter((b): b is NonNullable<typeof b> => b !== null && b.type !== 0)

      if (blocks.length === 0) {
        // D-12: pré-condição não é throw de fluxo — nada coletado, mundo intacto → no_effect.
        return { outcome: 'no_effect', observed: 0, expected: count, delta: {}, reason: `Bloco do tipo '${target}' não encontrado no raio de ${config.gatherSearchRadius} blocos` }
      }

      // 999.1 D-04/D-05: pré-check de alcançabilidade SÍNCRONO antes de collect().
      // getPathTo NÃO move o bot e evita o hang #222 do collectBlock em alvos inalcançáveis.
      // Granularidade de INSTÂNCIA: filtra os blocos alcançáveis; o cooldown por-TIPO (safety.ts)
      // só dispara quando NENHUMA instância é alcançável (este no_effect alimenta o nó execute).
      const movements = bot.collectBlock?.movements ?? bot.pathfinder.movements
      // C-fix: 200ms era curto demais p/ o A* — rejeitava blocos alcançáveis (bot ficava parado).
      // Configurável via GATHER_REACH_TIMEOUT_MS (default 1500). Roda em count=1 bloco, então é barato.
      const precheckTimeoutMs = config.gatherReachTimeoutMs
      const reachable = precheckTimeoutMs <= 0
        ? blocks  // pré-check desativado: deixa o collectBlock decidir alcançabilidade durante o pathing
        : blocks.filter((b) => {
            const goal = new goals.GoalGetToBlock(b.position.x, b.position.y, b.position.z)
            const result = (bot.pathfinder as any).getPathTo(movements, goal, precheckTimeoutMs)
            // 'success'/'partial' = alcançável o suficiente para tentar; 'noPath'/'timeout' = descartar
            return result?.status === 'success' || result?.status === 'partial'
          })

      if (reachable.length === 0) {
        // D-12: nenhuma instância alcançável — nada coletado → no_effect (não throw).
        return { outcome: 'no_effect', observed: 0, expected: count, delta: {}, reason: `Nenhuma instância alcançável de '${target}' (todas inalcançáveis no raio de ${config.gatherSearchRadius})` }
      }

      await executeWithSafety(
        () => bot.collectBlock.collect(reachable),
        {
          timeoutMs: config.digTimeoutMs * count,  // timeout proporcional à quantidade
          // Watchdog: inventário que cresce indica progresso
          progressChecker: () => bot.inventory.items().reduce((sum, item) => sum + item.count, 0),
          progressIntervalMs: 2_000,
          noProgressToleranceMs: config.digTimeoutMs,
          signal,  // D-16: 4° racer — preempção externa via AbortSignal
        }
      )
    } else {
      // Minerar bloco em posição específica
      const blockAtPos = bot.blockAt({ x: target.x, y: target.y, z: target.z } as Parameters<typeof bot.blockAt>[0])
      if (!blockAtPos || blockAtPos.type === 0) {
        // D-12: posição sem bloco (ou ar) — pré-condição → no_effect (não throw).
        return { outcome: 'no_effect', observed: 0, expected: count, delta: {}, reason: `Nenhum bloco em (${target.x}, ${target.y}, ${target.z}) ou é ar` }
      }

      const blockName = blockAtPos.name
      await executeWithSafety(
        () => bot.dig(blockAtPos),
        {
          timeoutMs: config.digTimeoutMs,
          // Watchdog: bloco desaparece quando minerado — posição do bloco vira air (WR-04)
          progressChecker: () => (bot.blockAt({ x: target.x, y: target.y, z: target.z } as Parameters<typeof bot.blockAt>[0])?.name === blockName ? 0 : 1),
          progressIntervalMs: 1_000,
          noProgressToleranceMs: config.digTimeoutMs,
          signal,  // D-16: 4° racer — preempção externa via AbortSignal
        }
      )
    }
  } catch (err) {
    threw = err
  }

  // D-08: captura o after e o delta SEMPRE — mesmo que a ação tenha lançado mid-progresso.
  const after = captureGroundState(bot, typeof target === 'string' ? undefined : target)
  const result = evaluateDig(before, after, count)

  // D-08: se lançou MAS coletou algo (observed > 0) → reporta o parcial real, não erro total.
  if (threw && result.observed === 0) {
    const reason = threw instanceof Error ? threw.name : String(threw)
    return { outcome: 'error', observed: 0, expected: count, delta: result.delta, reason }
  }
  return threw ? { ...result, reason: threw instanceof Error ? threw.name : String(threw) } : result
}

export const digTool = {
  name: 'dig',
  description: 'Minera ou coleta um bloco. Pode receber posição absoluta XYZ ou nome do tipo de bloco para coletar o mais próximo.',
  schema: DigSchema,
  execute: dig,
} as const
