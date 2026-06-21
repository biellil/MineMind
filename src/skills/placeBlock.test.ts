// src/skills/placeBlock.test.ts
// Fase 9 / D-01 / Pitfall 1: testes do primitivo `placeBlock` grounded.
//
// Cobre o helper PURO getRefAndFace (escolha de ref+face por blockAt mockado) e o wrapper
// placeBlockSafe (outcome deriva de bot.blockAt(alvo), NUNCA da Promise — engole o timeout
// como falso-negativo, D-01/Pitfall 1).
//
// Mock mínimo de Bot: bot.blockAt via mapa "x,y,z"->name (ausente = air), bot.equip/placeBlock
// async spies, bot.inventory.items() (molde shelter.test.ts).
import { test, expect } from 'bun:test'
import { getRefAndFace, placeBlockSafe } from './placeBlock'

interface MockItem {
  name: string
  type: number
}

const SOLID = new Set(['stone', 'cobblestone', 'dirt', 'oak_planks'])

/**
 * Cria um bot mockado para placeBlock.
 * @param opts.blocks       mapa "x,y,z" -> nome do bloco (ausente = 'air')
 * @param opts.items        itens do inventário
 * @param opts.placeRejects Error que bot.placeBlock rejeita (undefined = resolve)
 * @param opts.placedAfter  "x,y,z" -> nome do bloco que aparece DEPOIS do place (simula o mundo)
 */
function makeMockBot(opts: {
  blocks?: Record<string, string>
  items?: MockItem[]
  placeRejects?: Error
  placedAfter?: Record<string, string>
}) {
  const blocks: Record<string, string> = { ...(opts.blocks ?? {}) }
  const calls = { equipCount: 0, placeCount: 0 }
  const key = (p: { x: number; y: number; z: number }) => `${p.x},${p.y},${p.z}`

  const bot: any = {
    inventory: { items: () => opts.items ?? [] },
    blockAt: (p: { x: number; y: number; z: number }) => {
      const name = blocks[key(p)] ?? 'air'
      return { name, position: p }
    },
    equip: async () => {
      calls.equipCount += 1
    },
    placeBlock: async () => {
      calls.placeCount += 1
      // O place "afeta o mundo" ANTES de eventualmente rejeitar (simula server lagado).
      if (opts.placedAfter) Object.assign(blocks, opts.placedAfter)
      if (opts.placeRejects) throw opts.placeRejects
    },
  }
  return { bot, calls }
}

// ── getRefAndFace (puro) ──────────────────────────────────────────────────

test('getRefAndFace: vizinho sólido + alvo livre -> ref + face = -faceVector', () => {
  // alvo (0,64,0) livre; vizinho lateral (1,64,0) é sólido -> face aponta do ref ao alvo
  const { bot } = makeMockBot({ blocks: { '1,64,0': 'stone' } })
  const rf = getRefAndFace(bot, { x: 0, y: 64, z: 0 })
  expect(rf).not.toBeNull()
  // ref está em alvo + faceVector; face = -faceVector. Para o vizinho +X, faceVector=[1,0,0], face=[-1,0,0].
  expect(rf!.ref.name).toBe('stone')
  expect({ x: rf!.face.x, y: rf!.face.y, z: rf!.face.z }).toEqual({ x: -1, y: 0, z: 0 })
})

test('getRefAndFace: alvo totalmente cercado (sem face exposta/ref) -> null quando alvo ocupado', () => {
  // Se o próprio alvo já é sólido, não há onde colocar -> null.
  const { bot } = makeMockBot({ blocks: { '0,64,0': 'stone', '1,64,0': 'stone' } })
  const rf = getRefAndFace(bot, { x: 0, y: 64, z: 0 })
  expect(rf).toBeNull()
})

test('getRefAndFace: sem nenhum vizinho sólido -> null', () => {
  const { bot } = makeMockBot({ blocks: {} }) // tudo ar
  const rf = getRefAndFace(bot, { x: 0, y: 64, z: 0 })
  expect(rf).toBeNull()
})

test('getRefAndFace: prefere face de BAIXO (ref ACIMA do alvo) p/ tampar teto', () => {
  // tanto o bloco acima (0,65,0) quanto um lateral (1,64,0) são sólidos.
  // A ordem de FACES coloca [0,-1,0] primeiro: ref = alvo+[0,-1,0]? NÃO.
  // "Preferir face de baixo" = ref ACIMA do alvo, faceVector=[0,1,0], face=[0,-1,0].
  const { bot } = makeMockBot({ blocks: { '0,65,0': 'stone', '1,64,0': 'cobblestone' } })
  const rf = getRefAndFace(bot, { x: 0, y: 64, z: 0 })
  expect(rf).not.toBeNull()
  expect({ x: rf!.face.x, y: rf!.face.y, z: rf!.face.z }).toEqual({ x: 0, y: -1, z: 0 })
  expect(rf!.ref.name).toBe('stone') // o bloco de cima
})

// ── placeBlockSafe (grounded) ─────────────────────────────────────────────

const cobbleItem = { name: 'cobblestone', type: 4 } as any
const refBlock = { name: 'stone', position: { x: 0, y: 63, z: 0 } } as any
const faceUp = { x: 0, y: 1, z: 0 } as any
const target = { x: 0, y: 64, z: 0 }

test('placeBlockSafe: place resolve e alvo vira sólido -> success, observed 1', async () => {
  const { bot, calls } = makeMockBot({
    placedAfter: { '0,64,0': 'cobblestone' },
  })
  const r = await placeBlockSafe(bot, refBlock, faceUp, cobbleItem, target)
  expect(calls.equipCount).toBe(1) // D-02: equipa antes
  expect(r.outcome).toBe('success')
  expect(r.observed).toBe(1)
})

test('placeBlockSafe: place REJEITA com timeout MAS alvo vira sólido -> success (swallow falso-negativo)', async () => {
  const { bot } = makeMockBot({
    placedAfter: { '0,64,0': 'cobblestone' },
    placeRejects: new Error('Event blockUpdate:(0, 64, 0) did not fire within timeout of 5000ms'),
  })
  const r = await placeBlockSafe(bot, refBlock, faceUp, cobbleItem, target)
  expect(r.outcome).toBe('success') // Pitfall 1: a verdade é o mundo, não a Promise
  expect(r.observed).toBe(1)
})

test('placeBlockSafe: place REJEITA "No block has been placed" e alvo continua ar -> partial', async () => {
  const { bot } = makeMockBot({
    placeRejects: new Error('No block has been placed : the block is still air'),
  })
  const r = await placeBlockSafe(bot, refBlock, faceUp, cobbleItem, target)
  expect(r.outcome).toBe('partial')
  expect(r.reason).toMatch(/No block has been placed/)
})

test('placeBlockSafe: place resolve mas alvo continua ar -> no_effect', async () => {
  const { bot } = makeMockBot({}) // nada muda no mundo
  const r = await placeBlockSafe(bot, refBlock, faceUp, cobbleItem, target)
  expect(r.outcome).toBe('no_effect')
  expect(r.observed).toBe(0)
})
