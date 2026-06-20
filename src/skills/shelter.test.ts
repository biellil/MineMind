// src/skills/shelter.test.ts
// Plan 08-03 / D-08 / SURV-03: skill reflexa `shelter` — abrigo de emergência cavar-vs-pilar.
//
// Mock mínimo de Bot: bot.entity.position.offset, bot.blockAt (mock block com .name),
// bot.inventory.items(), bot.dig/placeBlock/equip (async no-op spies), bot.setControlState (spy).
// Cobre: canDig=true->cava; canDig=false->pilar; sem blocos->no_effect; cobertura->success.
import { test, expect } from 'bun:test'
import { shelter } from './shelter'

/** Vec3-like mínimo: offset (o que shelter usa para sondar blocos vizinhos). */
function vec(x: number, y: number, z: number): any {
  return {
    x,
    y,
    z,
    offset(ox: number, oy: number, oz: number) {
      return vec(x + ox, y + oy, z + oz)
    },
  }
}

interface MockItem {
  name: string
  type: number
}

/**
 * Cria um bot mockado para `shelter`.
 *
 * @param opts.items     itens do inventário
 * @param opts.blocks    mapa "x,y,z" -> nome do bloco naquela posição (ausente = air)
 * @param opts.coverAfter se true, o bloco 2 acima vira sólido após o place (simula cobertura)
 * @param opts.placeThrows se true, placeBlock rejeita (testa robustez mínima)
 */
function makeMockBot(opts: {
  items: MockItem[]
  blocks?: Record<string, string>
  coverAfter?: boolean
  placeThrows?: boolean
}) {
  const blocks: Record<string, string> = { ...(opts.blocks ?? {}) }
  const calls = {
    placeCount: 0,
    digCount: 0,
    equipCount: 0,
    controlStates: [] as Array<{ control: string; state: boolean }>,
  }
  const pos = vec(0, 64, 0)
  const key = (p: { x: number; y: number; z: number }) => `${p.x},${p.y},${p.z}`

  const bot: any = {
    entity: { position: pos },
    inventory: { items: () => opts.items },
    blockAt: (p: { x: number; y: number; z: number }) => {
      const name = blocks[key(p)] ?? 'air'
      return { name, position: p }
    },
    dig: async () => {
      calls.digCount += 1
    },
    equip: async () => {
      calls.equipCount += 1
    },
    lookAt: async () => {},
    placeBlock: async () => {
      calls.placeCount += 1
      if (opts.placeThrows) throw new Error('place falhou')
      if (opts.coverAfter) blocks[key(pos.offset(0, 2, 0))] = 'cobblestone'
    },
    setControlState: (control: string, state: boolean) => {
      calls.controlStates.push({ control, state })
    },
  }
  return { bot, calls }
}

const cobble = { name: 'cobblestone', type: 4 }

test('sem blocos colocáveis -> no_effect, observed 0', async () => {
  const { bot, calls } = makeMockBot({ items: [{ name: 'apple', type: 260 }] })
  const r = await shelter(bot, {})
  expect(r.outcome).toBe('no_effect')
  expect(r.observed).toBe(0)
  expect(r.reason).toMatch(/sem blocos/i)
  expect(calls.placeCount).toBe(0)
})

test('canDig=true (bloco sólido 2 abaixo) -> cava-e-tampa (bot.dig chamado)', async () => {
  const { bot, calls } = makeMockBot({
    items: [cobble],
    blocks: { '0,62,0': 'stone', '0,63,0': 'stone' }, // 2 abaixo e 1 abaixo sólidos
    coverAfter: true,
  })
  const r = await shelter(bot, {})
  expect(calls.digCount).toBeGreaterThanOrEqual(1)
  expect(r.outcome).toBe('success')
})

test('canDig=false (ar 2 abaixo) -> pilar 1x1 (jump + placeBlock)', async () => {
  const { bot, calls } = makeMockBot({
    items: [cobble],
    blocks: {}, // tudo ar -> não pode cavar -> pilar
    coverAfter: true,
  })
  await shelter(bot, {})
  expect(calls.digCount).toBe(0) // não cavou
  expect(calls.placeCount).toBeGreaterThanOrEqual(1) // colocou bloco (pilar)
  const jumpOn = calls.controlStates.some((c) => c.control === 'jump' && c.state === true)
  expect(jumpOn).toBe(true)
})

test('guarda anti-lava: lava 2 abaixo -> NÃO cava, tenta pilar', async () => {
  const { bot, calls } = makeMockBot({
    items: [cobble],
    blocks: { '0,62,0': 'lava' }, // lava 2 abaixo
    coverAfter: true,
  })
  await shelter(bot, {})
  expect(calls.digCount).toBe(0) // não cavou sobre lava
  expect(calls.placeCount).toBeGreaterThanOrEqual(1) // pilar
})

test('cobertura após (bloco 2 acima sólido) -> success, observed 1', async () => {
  const { bot } = makeMockBot({ items: [cobble], blocks: {}, coverAfter: true })
  const r = await shelter(bot, {})
  expect(r.outcome).toBe('success')
  expect(r.observed).toBe(1)
})

test('placeBlock lança -> não vira fluxo de throw; partial e reason anexado', async () => {
  const { bot } = makeMockBot({ items: [cobble], blocks: {}, placeThrows: true })
  const r = await shelter(bot, {})
  expect(r.outcome).toBe('partial') // sem cobertura
  expect(r.reason).toBeDefined()
})
