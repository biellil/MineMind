// src/llm/prompts.test.ts
// Cobre o render do enriquecimento de percepção em serializeContext:
// "Na mira" (condicional), "Sob os pés" (sempre), "Entidades próximas" (até 5, condicional)
// e percepção espacial híbrida (Phase 11.1): próx(x,y,z) Nm Δy±k para blocos/entidades/jogadores.
import { test, expect } from 'bun:test'
import { serializeContext } from './prompts'
import type { WorldSnapshot, EntityInfo, LookingAtBlock, Position3D, BlockSummary } from '../perception/types'

/** Helper de teste: BlockSummary com count e examples explícitos. */
function block(count: number, ...examples: Position3D[]): BlockSummary {
  return { count, examples }
}

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

test('D-16: poisLine renderizado e ANTES do FATO VERIFICADO', () => {
  const delta = { skill: 'gather', target: 'oak_log', outcome: 'partial', observed: 1, expected: 3 }
  const s = serializeContext(
    baseSnapshot(),
    undefined,
    undefined,
    [],
    delta,
    undefined,
    'POIs próximos: casa (12m), veia de ferro (40m)',
  )
  expect(s).toContain('POIs próximos: casa (12m)')
  expect(s.indexOf('POIs próximos:')).toBeLessThan(s.indexOf('FATO VERIFICADO'))
})

test('D-16: poisLine undefined -> saída NÃO contém "POIs próximos"', () => {
  const s = serializeContext(baseSnapshot(), undefined, undefined, [])
  expect(s).not.toContain('POIs próximos')
})

// === Task 1 (Phase 11.1): percepção espacial dos BLOCOS ===

test('D-01: bloco com examples -> coord absoluta do mais próximo + distância + Δy com sinal', () => {
  // bot em y=63, oak_log examples[0]={12,70,-5} -> Δy = 70-63 = +7
  const s = serializeContext(
    baseSnapshot({
      status: { health: 20, food: 20, position: { x: 0, y: 63, z: 0 }, timeOfDay: 0.2, isDay: true },
      nearbyBlockTypes: { oak_log: block(4, { x: 12, y: 70, z: -5 }) },
    }),
    undefined,
    undefined,
    [],
  )
  expect(s).toMatch(/oak_log×4 próx\(12,70,-5\)[^,]*Δy\+7/)
})

test('D-01: Δy negativo quando bloco abaixo do bot', () => {
  // bot y=70, exemplo y=65 -> Δy-5
  const s = serializeContext(
    baseSnapshot({
      status: { health: 20, food: 20, position: { x: 0, y: 70, z: 0 }, timeOfDay: 0.2, isDay: true },
      nearbyBlockTypes: { stone: block(2, { x: 1, y: 65, z: 1 }) },
    }),
    undefined,
    undefined,
    [],
  )
  expect(s).toContain('Δy-5')
})

test('D-01: Δy+0 (sinal + para zero, nunca Δy-0) na mesma altura', () => {
  const s = serializeContext(
    baseSnapshot({
      status: { health: 20, food: 20, position: { x: 0, y: 64, z: 0 }, timeOfDay: 0.2, isDay: true },
      nearbyBlockTypes: { stone: block(1, { x: 2, y: 64, z: 0 }) },
    }),
    undefined,
    undefined,
    [],
  )
  expect(s).toContain('Δy+0')
  expect(s).not.toContain('Δy-0')
})

test('D-03: bloco SEM examples -> ainda renderiza name×count (count nunca some), sem próx(', () => {
  const s = serializeContext(
    baseSnapshot({ nearbyBlockTypes: { dirt: block(9) } }),
    undefined,
    undefined,
    [],
  )
  expect(s).toContain('dirt×9')
  expect(s).not.toContain('próx(')
})

test('D-03: múltiplos exemplos por tipo prioritário sob orçamento folgado -> 3 próx( do tipo', () => {
  const s = serializeContext(
    baseSnapshot({
      nearbyBlockTypes: {
        oak_log: block(3, { x: 1, y: 64, z: 0 }, { x: 2, y: 64, z: 0 }, { x: 3, y: 64, z: 0 }),
      },
    }),
    undefined,
    undefined,
    [],
  )
  expect(s).toContain('próx(1,64,0)')
  expect(s).toContain('próx(2,64,0)')
  expect(s).toContain('próx(3,64,0)')
})

test('D-03: teto global é o ÚNICO gate -> 12 tipos: todos os nomes presentes E <=18 próx(', () => {
  const types: Record<string, BlockSummary> = {}
  for (let i = 0; i < 12; i++) {
    types[`blk${i}`] = block(2, { x: i, y: 64, z: 0 }, { x: i + 1, y: 64, z: 0 }, { x: i + 2, y: 64, z: 0 })
  }
  const s = serializeContext(baseSnapshot({ nearbyBlockTypes: types }), undefined, undefined, [])
  // (a) todos os 12 nomes aparecem como name×count
  for (let i = 0; i < 12; i++) {
    expect(s).toContain(`blk${i}×2`)
  }
  // (b) no máximo 18 ocorrências de próx(
  const count = (s.match(/próx\(/g) ?? []).length
  expect(count).toBeLessThanOrEqual(18)
})

test('D-03: priorização sob teto -> oak_log recebe coords antes de dirt', () => {
  // teto de 18; criar tipos prioritários suficientes para consumir o budget antes de chegar em dirt
  const types: Record<string, BlockSummary> = {
    oak_log: block(3, { x: 1, y: 64, z: 0 }, { x: 2, y: 64, z: 0 }, { x: 3, y: 64, z: 0 }),
    stone: block(3, { x: 4, y: 64, z: 0 }, { x: 5, y: 64, z: 0 }, { x: 6, y: 64, z: 0 }),
    cobblestone: block(3, { x: 7, y: 64, z: 0 }, { x: 8, y: 64, z: 0 }, { x: 9, y: 64, z: 0 }),
    coal_ore: block(3, { x: 10, y: 64, z: 0 }, { x: 11, y: 64, z: 0 }, { x: 12, y: 64, z: 0 }),
    iron_ore: block(3, { x: 13, y: 64, z: 0 }, { x: 14, y: 64, z: 0 }, { x: 15, y: 64, z: 0 }),
    diamond_ore: block(3, { x: 16, y: 64, z: 0 }, { x: 17, y: 64, z: 0 }, { x: 18, y: 64, z: 0 }),
    dirt: block(3, { x: 90, y: 64, z: 0 }, { x: 91, y: 64, z: 0 }, { x: 92, y: 64, z: 0 }),
  }
  const s = serializeContext(baseSnapshot({ nearbyBlockTypes: types }), undefined, undefined, [])
  // oak_log (prioritário) recebe sua coord
  expect(s).toContain('próx(1,64,0)')
  // dirt (lixo) fica só com name×count — sua coord não cabe no budget
  expect(s).toContain('dirt×3')
  expect(s).not.toContain('próx(90,64,0)')
})

test('D-02: bloco sem veredito textual de alcançabilidade', () => {
  const s = serializeContext(
    baseSnapshot({ nearbyBlockTypes: { oak_log: block(1, { x: 0, y: 200, z: 0 }) } }),
    undefined,
    undefined,
    [],
  )
  expect(s).not.toContain('inalcançável')
  expect(s).not.toContain('no alto')
  expect(s).not.toContain('fora de alcance')
  expect(s).not.toContain('alto demais')
})
