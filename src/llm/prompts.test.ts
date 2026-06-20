// src/llm/prompts.test.ts
// Cobre o render do enriquecimento de percepção em serializeContext:
// "Na mira" (condicional), "Sob os pés" (sempre) e "Entidades próximas" (até 5, condicional).
import { test, expect } from 'bun:test'
import { serializeContext } from './prompts'
import type { WorldSnapshot, EntityInfo, LookingAtBlock } from '../perception/types'

function baseSnapshot(over: Partial<WorldSnapshot> = {}): WorldSnapshot {
  return {
    capturedAt: 0,
    status: { health: 20, food: 20, position: { x: 0, y: 64, z: 0 }, timeOfDay: 0.2, isDay: true },
    entities: [],
    players: [],
    nearbyBlockTypes: {},
    inventory: [],
    lookingAt: null,
    underfoot: 'air',
    ...over,
  }
}

function entity(name: string, distance: number): EntityInfo {
  return { id: distance, type: 'mob', kind: 'Passive mobs', name, position: { x: distance, y: 64, z: 0 }, distance, health: 20, metadata: null }
}

const oakLog: LookingAtBlock = { name: 'oak_log', position: { x: 3, y: 64, z: 0 }, distance: 3 }

test('lookingAt preenchido -> saída contém "Na mira: oak_log"', () => {
  const s = serializeContext(baseSnapshot({ lookingAt: oakLog }), undefined, undefined, [])
  expect(s).toContain('Na mira: oak_log')
})

test('lookingAt null -> saída NÃO contém "Na mira"', () => {
  const s = serializeContext(baseSnapshot({ lookingAt: null }), undefined, undefined, [])
  expect(s).not.toContain('Na mira')
})

test('underfoot é sempre renderizado -> "Sob os pés: grass_block"', () => {
  const s = serializeContext(baseSnapshot({ underfoot: 'grass_block' }), undefined, undefined, [])
  expect(s).toContain('Sob os pés: grass_block')
})

test('entities não-vazio -> "Entidades próximas:" com os nomes, ordenadas por distância', () => {
  const s = serializeContext(
    baseSnapshot({ entities: [entity('Creeper', 2), entity('Zombie', 5)] }),
    undefined,
    undefined,
    [],
  )
  expect(s).toContain('Entidades próximas:')
  expect(s).toContain('Creeper (2m)')
  expect(s).toContain('Zombie (5m)')
})

test('entities com >5 itens -> apenas 5 renderizados', () => {
  const many = [1, 2, 3, 4, 5, 6, 7].map((d) => entity(`mob${d}`, d))
  const s = serializeContext(baseSnapshot({ entities: many }), undefined, undefined, [])
  expect(s).toContain('mob1')
  expect(s).toContain('mob5')
  expect(s).not.toContain('mob6')
  expect(s).not.toContain('mob7')
})

test('entities vazio -> saída NÃO contém "Entidades próximas"', () => {
  const s = serializeContext(baseSnapshot({ entities: [] }), undefined, undefined, [])
  expect(s).not.toContain('Entidades próximas')
})

test('serializeContext(null, ...) não lança e retorna fallback de sem percepção', () => {
  expect(() => serializeContext(null, undefined, undefined, [])).not.toThrow()
  const s = serializeContext(null, undefined, undefined, [])
  expect(s).toContain('(sem percepção disponível)')
})
