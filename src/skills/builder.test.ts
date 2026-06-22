// src/skills/builder.test.ts
// Plan 12-01 / Task 2 / D-01..D-05: builder genérico idempotente.
//
// Convenção do projeto (station.test.ts): sobrescrever __builderDeps (placeBlockSafe/getRefAndFace/
// isFilled) em vez de mock.module (que vaza global no bun). O mundo é simulado por um Set de posições
// preenchidas; cada place "preenche" o alvo (ou não, conforme o cenário).
import { test, expect, afterEach } from 'bun:test'
import { runBlueprint, __builderDeps, type BlueprintBlock } from './builder'
import type { SkillResult } from '../grounding/types'

// Snapshot dos deps reais para restaurar entre testes.
const realDeps = { ...__builderDeps }
afterEach(() => {
  __builderDeps.placeBlockSafe = realDeps.placeBlockSafe
  __builderDeps.getRefAndFace = realDeps.getRefAndFace
  __builderDeps.isFilled = realDeps.isFilled
})

const key = (p: { x: number; y: number; z: number }) => `${p.x},${p.y},${p.z}`

/** Mock-bot mínimo: posição (para orderForReach), inventário com 1 cobblestone, lookAt no-op. */
function makeBot(items: Array<{ name: string; type: number }> = [{ name: 'cobblestone', type: 4 }]) {
  return {
    entity: { position: { x: 100, y: 64, z: 100 } },
    inventory: { items: () => items },
    lookAt: async () => {},
    equip: async () => {},
  } as any
}

/**
 * Instala um mundo mockado nos __builderDeps.
 * @param filled  posições já preenchidas no início.
 * @param placeable função que decide se um getRefAndFace devolve face (default: sempre).
 * @param onPlace  efeito de placeBlockSafe (default: preenche o alvo + success).
 */
function installWorld(opts: {
  filled?: string[]
  noFaceAt?: string[]
  onPlace?: (pos: { x: number; y: number; z: number }, filled: Set<string>) => SkillResult
}) {
  const filled = new Set(opts.filled ?? [])
  const noFace = new Set(opts.noFaceAt ?? [])
  const placeCalls: string[] = []

  __builderDeps.isFilled = ((_bot: any, pos: { x: number; y: number; z: number }) =>
    filled.has(key(pos))) as typeof __builderDeps.isFilled

  __builderDeps.getRefAndFace = ((_bot: any, pos: { x: number; y: number; z: number }) => {
    if (noFace.has(key(pos))) return null
    return { ref: {} as any, face: { x: 0, y: -1, z: 0 } as any }
  }) as typeof __builderDeps.getRefAndFace

  __builderDeps.placeBlockSafe = (async (
    _bot: any,
    _ref: any,
    _face: any,
    _item: any,
    targetPos: { x: number; y: number; z: number },
  ) => {
    placeCalls.push(key(targetPos))
    if (opts.onPlace) return opts.onPlace(targetPos, filled)
    filled.add(key(targetPos)) // default: preenche
    return { outcome: 'success', observed: 1, expected: 1, delta: {} } as SkillResult
  }) as typeof __builderDeps.placeBlockSafe

  return { filled, placeCalls }
}

function bp(...coords: Array<[number, number, number]>): BlueprintBlock[] {
  return coords.map(([x, y, z]) => ({ pos: { x, y, z }, bloco: 'cobblestone' }))
}

test('lista vazia → no_effect, observed 0, expected 0', async () => {
  installWorld({})
  const r = await runBlueprint(makeBot(), [])
  expect(r.outcome).toBe('no_effect')
  expect(r.observed).toBe(0)
  expect(r.expected).toBe(0)
})

test('3 posições todas colocáveis → success, observed 3, expected 3', async () => {
  installWorld({})
  const r = await runBlueprint(makeBot(), bp([0, 64, 0], [1, 64, 0], [2, 64, 0]))
  expect(r.outcome).toBe('success')
  expect(r.observed).toBe(3)
  expect(r.expected).toBe(3)
})

test('1 posição sem face alcançável → pula, partial 2/3, NÃO lança', async () => {
  const { placeCalls } = installWorld({ noFaceAt: ['1,64,0'] })
  const r = await runBlueprint(makeBot(), bp([0, 64, 0], [1, 64, 0], [2, 64, 0]))
  expect(r.outcome).toBe('partial')
  expect(r.observed).toBe(2)
  expect(r.expected).toBe(3)
  expect(placeCalls).not.toContain('1,64,0') // sem face → nunca chamou place
})

test('idempotência: posição já preenchida é pulada sem chamar placeBlockSafe', async () => {
  const { placeCalls } = installWorld({ filled: ['1,64,0'] })
  const r = await runBlueprint(makeBot(), bp([0, 64, 0], [1, 64, 0], [2, 64, 0]))
  expect(r.outcome).toBe('success')
  expect(r.observed).toBe(3)
  expect(placeCalls).not.toContain('1,64,0') // já preenchida → não recoloca
  expect(placeCalls).toContain('0,64,0')
  expect(placeCalls).toContain('2,64,0')
})

test('abort entre blocos: signal abortado após o 1º bloco para o loop antes do próximo place', async () => {
  const ac = new AbortController()
  const { placeCalls } = installWorld({
    onPlace: (pos, filled) => {
      filled.add(key(pos))
      ac.abort() // aborta logo após o primeiro place
      return { outcome: 'success', observed: 1, expected: 1, delta: {} } as SkillResult
    },
  })
  // 3 posições com y diferentes para ordem previsível (baixo→cima): (0,64,0) sai primeiro.
  const r = await runBlueprint(makeBot(), bp([0, 64, 0], [0, 65, 0], [0, 66, 0]), ac.signal)
  expect(placeCalls.length).toBe(1) // só o primeiro bloco foi colocado
  expect(r.outcome).toBe('partial')
  expect(r.observed).toBe(1)
  expect(r.expected).toBe(3)
})

test('retry idempotente: 1ª tentativa falha (no_effect), 2ª converge → success', async () => {
  let attempts = 0
  const { placeCalls } = installWorld({
    onPlace: (pos, filled) => {
      attempts++
      if (attempts === 1) {
        // primeira tentativa NÃO preenche → no_effect, força o retry
        return { outcome: 'no_effect', observed: 0, expected: 1, delta: {} } as SkillResult
      }
      filled.add(key(pos))
      return { outcome: 'success', observed: 1, expected: 1, delta: {} } as SkillResult
    },
  })
  const r = await runBlueprint(makeBot(), bp([0, 64, 0]))
  expect(r.outcome).toBe('success')
  expect(r.observed).toBe(1)
  expect(placeCalls.length).toBeGreaterThanOrEqual(2) // re-tentou (placeRetries >= 1)
})
