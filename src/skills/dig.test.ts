// src/skills/dig.test.ts
// 999.1-03 / D-04/D-05: pré-check de alcançabilidade (getPathTo) antes de collect().
// Mock mínimo de Bot com os campos do caminho `typeof target === 'string'` de dig().
import { test, expect } from 'bun:test'
import { dig } from './dig'

interface MockBlock {
  name: string
  type: number
  position: { x: number; y: number; z: number }
}

/**
 * Cria um bot mockado com os campos que o caminho string de dig() usa:
 * findBlocks, blockAt, inventory.items, collectBlock.collect/movements,
 * pathfinder.getPathTo/movements.
 *
 * @param opts.positions   posições retornadas por findBlocks
 * @param opts.statusFor   decide o status do getPathTo por índice do bloco
 * @param opts.collectImpl implementação opcional de collectBlock.collect
 */
function makeMockBot(opts: {
  positions: Array<{ x: number; y: number; z: number }>
  statusFor: (index: number) => string
  collectImpl?: (blocks: MockBlock[]) => Promise<void>
}) {
  const collectCalls: MockBlock[][] = []
  // ordem em que blockAt foi chamado define o índice -> status do getPathTo
  const posToIndex = new Map<string, number>()
  opts.positions.forEach((p, i) => posToIndex.set(`${p.x},${p.y},${p.z}`, i))

  const bot: any = {
    findBlocks: () => opts.positions,
    blockAt: (pos: { x: number; y: number; z: number }) => ({
      name: 'oak_log',
      type: 17,
      position: pos,
    }),
    inventory: { items: () => [] },
    collectBlock: {
      movements: {},
      collect: async (blocks: MockBlock[]) => {
        collectCalls.push(blocks)
        if (opts.collectImpl) await opts.collectImpl(blocks)
      },
    },
    pathfinder: {
      movements: {},
      getPathTo: (_movements: unknown, goal: any) => {
        // GoalGetToBlock guarda x/y/z; mapeamos de volta ao índice do bloco
        const key = `${goal.x},${goal.y},${goal.z}`
        const idx = posToIndex.get(key) ?? 0
        return { status: opts.statusFor(idx) }
      },
    },
  }
  return { bot, collectCalls }
}

test('caso 1: todos inalcançáveis -> lança "Nenhuma instância alcançável" e NÃO chama collect', async () => {
  const { bot, collectCalls } = makeMockBot({
    positions: [
      { x: 1, y: 64, z: 1 },
      { x: 2, y: 64, z: 2 },
    ],
    statusFor: () => 'noPath',
  })

  await expect(dig(bot, { target: 'oak_log', count: 1 })).rejects.toThrow(
    /Nenhuma instância alcançável/,
  )
  expect(collectCalls.length).toBe(0)
}, 8000)

test('caso 2: ao menos um alcançável -> collect chamado só com os alcançáveis', async () => {
  const { bot, collectCalls } = makeMockBot({
    positions: [
      { x: 1, y: 64, z: 1 }, // alcançável
      { x: 2, y: 64, z: 2 }, // inalcançável
    ],
    statusFor: (i) => (i === 0 ? 'success' : 'noPath'),
    collectImpl: async () => {},
  })

  await dig(bot, { target: 'oak_log', count: 2 })

  expect(collectCalls.length).toBe(1)
  expect(collectCalls[0]!.length).toBe(1)
  expect(collectCalls[0]![0]!.position).toEqual({ x: 1, y: 64, z: 1 })
}, 8000)

test('caso 3: nenhum candidato -> lança "não encontrado"', async () => {
  const { bot, collectCalls } = makeMockBot({
    positions: [],
    statusFor: () => 'noPath',
  })

  await expect(dig(bot, { target: 'oak_log', count: 1 })).rejects.toThrow(
    /não encontrado/,
  )
  expect(collectCalls.length).toBe(0)
}, 8000)
