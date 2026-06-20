// src/skills/flee.test.ts
// Plan 08-03 / D-06 / SURV-02: skill reflexa `flee` grounded por delta de distância ao mob.
//
// Mock mínimo de Bot (estilo eat.test.ts/dig.test.ts): bot.entity.position (Vec3-like com
// distanceTo + offset), bot.nearestEntity, bot.pathfinder.{setGoal,goto} (spies), bot.lookAt,
// bot.setControlState (spy). Cobre TODOS os casos do bloco <behavior> do plano.
import { test, expect } from 'bun:test'
import { flee } from './flee'

/** Vec3-like mínimo: distanceTo + offset (o que flee/shelter usam). */
function vec(x: number, y: number, z: number): any {
  return {
    x,
    y,
    z,
    distanceTo(o: { x: number; y: number; z: number }) {
      const dx = x - o.x
      const dy = y - o.y
      const dz = z - o.z
      return Math.sqrt(dx * dx + dy * dy + dz * dz)
    },
    offset(ox: number, oy: number, oz: number) {
      return vec(x + ox, y + oy, z + oz)
    },
  }
}

/**
 * Cria um bot mockado para `flee`.
 *
 * @param opts.botPos      posição inicial do bot
 * @param opts.mob         entidade mob (com .name e .position); null = sem mob
 * @param opts.gotoThrows  se truthy, goto() rejeita com este erro (testa fallback sprint)
 * @param opts.posAfter    posição do bot após a navegação (simula deslocamento real)
 */
function makeMockBot(opts: {
  botPos: { x: number; y: number; z: number }
  mob?: { name?: string; kind?: string; position: { x: number; y: number; z: number } } | null
  gotoThrows?: Error | null
  posAfter?: { x: number; y: number; z: number }
}) {
  const calls = {
    setGoalArgs: [] as Array<{ goal: unknown; dynamic?: boolean }>,
    setGoalNull: 0,
    gotoCount: 0,
    controlStates: [] as Array<{ control: string; state: boolean }>,
    lookAtCount: 0,
  }
  let currentPos = vec(opts.botPos.x, opts.botPos.y, opts.botPos.z)
  const mobEntity = opts.mob
    ? { ...opts.mob, position: vec(opts.mob.position.x, opts.mob.position.y, opts.mob.position.z) }
    : null

  const bot: any = {
    entity: {
      get position() {
        return currentPos
      },
    },
    nearestEntity: (filter?: (e: any) => boolean) => {
      if (!mobEntity) return null
      return !filter || filter(mobEntity) ? mobEntity : null
    },
    pathfinder: {
      setGoal: (goal: unknown, dynamic?: boolean) => {
        if (goal === null) calls.setGoalNull += 1
        else calls.setGoalArgs.push({ goal, dynamic })
      },
      goto: async () => {
        calls.gotoCount += 1
        if (opts.gotoThrows) throw opts.gotoThrows
        if (opts.posAfter) currentPos = vec(opts.posAfter.x, opts.posAfter.y, opts.posAfter.z)
      },
    },
    lookAt: async () => {
      calls.lookAtCount += 1
    },
    setControlState: (control: string, state: boolean) => {
      calls.controlStates.push({ control, state })
      // sprint cego: simula deslocamento ao ligar forward
      if (control === 'forward' && state && opts.posAfter) {
        currentPos = vec(opts.posAfter.x, opts.posAfter.y, opts.posAfter.z)
      }
    },
  }
  return { bot, calls, setPos: (p: { x: number; y: number; z: number }) => (currentPos = vec(p.x, p.y, p.z)) }
}

const HOSTILE = { name: 'zombie', kind: 'Hostile mobs', position: { x: 10, y: 64, z: 0 } }

test('sucesso: distância ao mob aumenta após goto -> success, observed 1', async () => {
  // bot em (0,64,0), mob em (10,64,0) -> dist 10. Após goto, bot vai p/ (-10,64,0) -> dist 20.
  const { bot } = makeMockBot({ botPos: { x: 0, y: 64, z: 0 }, mob: HOSTILE, posAfter: { x: -10, y: 64, z: 0 } })
  const r = await flee(bot, {})
  expect(r.outcome).toBe('success')
  expect(r.observed).toBe(1)
})

test('cria GoalInvert(GoalFollow) e chama setGoal(goal, true)', async () => {
  const { bot, calls } = makeMockBot({ botPos: { x: 0, y: 64, z: 0 }, mob: HOSTILE, posAfter: { x: -10, y: 64, z: 0 } })
  await flee(bot, {})
  expect(calls.setGoalArgs.length).toBeGreaterThanOrEqual(1)
  expect(calls.setGoalArgs[0]!.dynamic).toBe(true)
})

test('sem mob para fugir -> no_effect, observed 0', async () => {
  const { bot } = makeMockBot({ botPos: { x: 0, y: 64, z: 0 }, mob: null })
  const r = await flee(bot, {})
  expect(r.outcome).toBe('no_effect')
  expect(r.observed).toBe(0)
  expect(r.reason).toMatch(/sem mob/i)
})

test('goto rejeita (noPath) -> aciona fallback sprint cego (setControlState sprint)', async () => {
  const { bot, calls } = makeMockBot({
    botPos: { x: 0, y: 64, z: 0 },
    mob: HOSTILE,
    gotoThrows: new Error('NoPath'),
    posAfter: { x: -8, y: 64, z: 0 },
  })
  const r = await flee(bot, {})
  const sprintCalls = calls.controlStates.filter((c) => c.control === 'sprint' && c.state === true)
  expect(sprintCalls.length).toBeGreaterThanOrEqual(1)
  // distância aumentou via sprint cego (0->-8 => dist 18 > 10) -> success/partial
  expect(['success', 'partial']).toContain(r.outcome)
})

test('abort -> chama bot.pathfinder.setGoal(null) (D-07 forçado)', async () => {
  const { bot, calls } = makeMockBot({ botPos: { x: 0, y: 64, z: 0 }, mob: HOSTILE, posAfter: { x: -10, y: 64, z: 0 } })
  const ac = new AbortController()
  const p = flee(bot, { signal: ac.signal })
  ac.abort()
  await p
  expect(calls.setGoalNull).toBeGreaterThanOrEqual(1)
})

test('distância não aumentou após tudo -> no_effect (grounded por delta real)', async () => {
  // posAfter ausente -> bot não se move; goto resolve sem mexer na posição.
  const { bot } = makeMockBot({ botPos: { x: 0, y: 64, z: 0 }, mob: HOSTILE })
  const r = await flee(bot, {})
  expect(r.outcome).toBe('no_effect')
  expect(r.observed).toBe(0)
})

test('fallback sprint sempre limpa os controlStates (forward/sprint false ao final)', async () => {
  const { bot, calls } = makeMockBot({
    botPos: { x: 0, y: 64, z: 0 },
    mob: HOSTILE,
    gotoThrows: new Error('Timeout'),
    posAfter: { x: -8, y: 64, z: 0 },
  })
  await flee(bot, {})
  const forwardOff = calls.controlStates.some((c) => c.control === 'forward' && c.state === false)
  const sprintOff = calls.controlStates.some((c) => c.control === 'sprint' && c.state === false)
  expect(forwardOff).toBe(true)
  expect(sprintOff).toBe(true)
})
