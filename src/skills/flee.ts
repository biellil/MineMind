// src/skills/flee.ts
// SURV-02 / D-06: skill reflexa `flee` — foge do mob hostil mais próximo via
// GoalInvert(GoalFollow) + setGoal(goal, true) (dynamic). Quando o A* falha (noPath/timeout),
// cai para sprint cego no vetor oposto (setControlState forward+sprint). Sem dependência nova.
//
// D-07: a parada/abort da navegação reflexa usa bot.pathfinder.setGoal(null) (forçado/imediato),
// NUNCA bot.pathfinder.stop() (gracioso). Latência sub-segundo é requisito do System 1.
//
// Fase 7 (D-08/D-12): SEMPRE resolve com SkillResult — nunca lança como fluxo. O outcome deriva
// do delta REAL de distância ao mob (antes/depois), não da resolução da Promise. SURV-05: toda
// navegação reflexa herda os bounds do 999.1 (navigateTimeoutMs no executeWithSafety; o A* em si
// usa o searchRadius/thinkTimeout do Movements global configurado no boot).
import { z } from 'zod'
import type { Bot } from 'mineflayer'
import { goals } from 'mineflayer-pathfinder'
import { executeWithSafety } from './executor'
import type { SkillResult } from '../grounding/types'
import { config } from '../config'

/** Schema Zod do skill flee (D-11). */
export const FleeSchema = z.object({
  entityName: z
    .string()
    .max(64)
    .optional()
    .describe('Nome do mob a fugir; se ausente, foge do hostil mais próximo'),
  radius: z.number().min(4).max(32).default(16).describe('Raio de fuga'),
})

export type FleeParams = z.infer<typeof FleeSchema>

/** Limpa os controlStates do sprint cego (best-effort, nunca lança). */
function clearSprint(bot: Bot): void {
  try {
    bot.setControlState('forward', false)
    bot.setControlState('sprint', false)
  } catch {
    /* ignora se o bot já não tem corpo */
  }
}

/**
 * Sprint cego no vetor oposto ao mob (fallback quando o A* falha — D-06). NUNCA lança.
 * Olha para o ponto-alvo "atrás" (afastando-se do mob), liga forward+sprint por um curto
 * período e limpa os controlStates ao final.
 */
async function blindSprintAway(bot: Bot, mob: { position: { x: number; y: number; z: number } }): Promise<void> {
  try {
    const pos = bot.entity.position
    // Vetor oposto ao mob, projetado ~16 blocos à frente.
    const away = pos.offset((pos.x - mob.position.x) * 16, 0, (pos.z - mob.position.z) * 16)
    await bot.lookAt(away)
    bot.setControlState('forward', true)
    bot.setControlState('sprint', true)
    await new Promise<void>((r) => setTimeout(r, 600))
  } catch {
    /* fallback é best-effort */
  } finally {
    clearSprint(bot)
  }
}

/**
 * Foge do mob hostil mais próximo (reflexo de sobrevivência, SURV-02/D-06).
 *
 * @param bot - Instância do bot (precisa de pathfinder carregado após spawn)
 * @param rawParams - Parâmetros não validados (validados via Zod; signal é injeção de runtime)
 */
export async function flee(bot: Bot, rawParams: unknown): Promise<SkillResult> {
  // Extrair signal ANTES do Zod (injeção de runtime — padrão navigate.ts/eat.ts).
  const signal = (rawParams as Record<string, unknown>)?.signal as AbortSignal | undefined
  const { entityName, radius } = FleeSchema.parse(rawParams ?? {})

  // Localiza o mob: por nome se dado, senão o hostil mais próximo (EntityInfo.kind populado na percepção).
  const mob = entityName
    ? bot.nearestEntity((e) => e.name === entityName)
    : bot.nearestEntity((e) => (e as { kind?: string }).kind === 'Hostile mobs')

  if (!mob) {
    return { outcome: 'no_effect', observed: 0, expected: 1, delta: {}, reason: 'sem mob para fugir' }
  }

  const distBefore = bot.entity.position.distanceTo(mob.position)

  // D-07: abort força parada IMEDIATA via setGoal(null) (não stop()) + limpa o sprint cego.
  if (signal) {
    signal.addEventListener(
      'abort',
      () => {
        try {
          bot.pathfinder.setGoal(null)
        } catch {
          /* ignora se pathfinder já parou */
        }
        clearSprint(bot)
      },
      { once: true },
    )
  }

  // D-06: GoalInvert(GoalFollow) — fugir é o inverso de seguir. GoalRunAway não existe.
  const goal = new goals.GoalInvert(new goals.GoalFollow(mob, radius))

  let threw: unknown = null
  try {
    // SURV-05: herda os bounds do 999.1 — navigateTimeoutMs no envelope; o A* usa o searchRadius/
    // thinkTimeout do Movements global (configurado no boot, valores em config.pathfinder*).
    await executeWithSafety(
      () => {
        bot.pathfinder.setGoal(goal, true) // dynamic: re-planeja enquanto o mob se move
        return bot.pathfinder.goto(goal)
      },
      {
        timeoutMs: config.navigateTimeoutMs,
        progressChecker: () => Math.round(bot.entity.position.distanceTo(mob.position)),
        progressIntervalMs: 2_000,
        noProgressToleranceMs: 10_000,
        signal,
      },
    )
  } catch (err) {
    threw = err
  }

  // Fallback sprint cego SE o A* falhou (noPath/timeout/stuck) e o abort não foi disparado.
  if (threw && !signal?.aborted) {
    const reason = threw instanceof Error ? threw.message : String(threw)
    if (/nopath|no path|timeout|stuck|sem progresso/i.test(reason)) {
      await blindSprintAway(bot, mob)
    }
  }

  // Grounding por delta REAL de distância (não pela Promise): aumentou = fugiu.
  const distAfter = bot.entity.position.distanceTo(mob.position)
  const gained = distAfter - distBefore
  const outcome: SkillResult['outcome'] = gained > 1 ? 'success' : gained > 0 ? 'partial' : 'no_effect'
  const observed = gained > 0 ? 1 : 0
  const reason = threw ? (threw instanceof Error ? threw.message : String(threw)) : undefined

  return { outcome, observed, expected: 1, delta: {}, reason }
}

/** Tool descriptor para LangGraph (D-11) */
export const fleeTool = {
  name: 'flee',
  description: 'Foge do mob hostil mais próximo (GoalInvert + fallback sprint)',
  schema: FleeSchema,
  execute: flee,
} as const
