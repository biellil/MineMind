// src/cognition/arbiter.test.ts
// Cobre a arbitragem por prioridade fixa (D-05) e a escada de Gathering (D-07).
import { test, expect } from 'bun:test'
import { arbitrate, highestPriorityGatherTarget, hasNearbyPlayer } from './arbiter'
import type { WorldSnapshot } from '../perception/types'

// Constrói um WorldSnapshot mínimo: só os campos que a arbitragem lê.
function snapshot(opts: {
  players?: Array<{ username: string; distance: number | null }>
  blocks?: Record<string, number>
}): WorldSnapshot {
  const nearbyBlockTypes: Record<string, { count: number; examples: [] }> = {}
  for (const [name, count] of Object.entries(opts.blocks ?? {})) {
    nearbyBlockTypes[name] = { count, examples: [] }
  }
  return {
    players: (opts.players ?? []).map((p) => ({ username: p.username, distance: p.distance })),
    nearbyBlockTypes,
  } as unknown as WorldSnapshot
}

// --- hasNearbyPlayer ---

test('hasNearbyPlayer true quando jogador dentro do socialRadius (8)', () => {
  expect(hasNearbyPlayer(snapshot({ players: [{ username: 'steve', distance: 5 }] }))).toBe(true)
})

test('hasNearbyPlayer false quando jogador fora do socialRadius', () => {
  expect(hasNearbyPlayer(snapshot({ players: [{ username: 'steve', distance: 50 }] }))).toBe(false)
})

test('hasNearbyPlayer trata distance null como infinito (fora)', () => {
  expect(hasNearbyPlayer(snapshot({ players: [{ username: 'steve', distance: null }] }))).toBe(false)
})

// --- highestPriorityGatherTarget ---

test('escolhe o bloco de MAIOR prioridade presente (oak_log vence stone)', () => {
  const s = snapshot({ blocks: { stone: 10, oak_log: 2 } })
  expect(highestPriorityGatherTarget(s)).toBe('oak_log')
})

test('retorna o único bloco da escada presente', () => {
  expect(highestPriorityGatherTarget(snapshot({ blocks: { stone: 4 } }))).toBe('stone')
})

test('retorna null quando nenhum bloco da escada está presente', () => {
  expect(highestPriorityGatherTarget(snapshot({ blocks: { grass: 99, dirt: 50 } }))).toBeNull()
})

test('ignora bloco com count 0', () => {
  expect(highestPriorityGatherTarget(snapshot({ blocks: { oak_log: 0, stone: 3 } }))).toBe('stone')
})

test('ignora alvo em excludeTargets (cooldown) e passa para o próximo da escada', () => {
  const s = snapshot({ blocks: { oak_log: 2, stone: 5 } })
  expect(highestPriorityGatherTarget(s, new Set(['oak_log']))).toBe('stone')
})

// --- arbitrate ---

test('mode paused -> idle (freio vence)', () => {
  const s = snapshot({ players: [{ username: 'steve', distance: 2 }], blocks: { oak_log: 5 } })
  expect(arbitrate(s, 'paused')).toBe('idle')
})

test('mode standby -> socializing (vem para perto e aguarda)', () => {
  const s = snapshot({ blocks: { oak_log: 5 } })
  expect(arbitrate(s, 'standby')).toBe('socializing')
})

test('jogador próximo -> socializing', () => {
  const s = snapshot({ players: [{ username: 'steve', distance: 3 }], blocks: { oak_log: 5 } })
  expect(arbitrate(s, 'autonomous')).toBe('socializing')
})

test('sem jogador + bloco da escada presente -> gathering', () => {
  const s = snapshot({ blocks: { stone: 5 } })
  expect(arbitrate(s, 'autonomous')).toBe('gathering')
})

test('sem jogador e sem alvo da escada -> exploring', () => {
  const s = snapshot({ blocks: { grass: 10 } })
  expect(arbitrate(s, 'autonomous')).toBe('exploring')
})

test('alvo em cooldown ignorado: sem outro alvo -> exploring', () => {
  const s = snapshot({ blocks: { oak_log: 5 } })
  expect(arbitrate(s, 'autonomous', new Set(['oak_log']))).toBe('exploring')
})
