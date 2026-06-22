// src/skills/blueprints.test.ts
// Plan 12-01 / Task 1 / D-07/D-09: geradores de blueprint PUROS — sem bot, sem I/O.
// Cobre: casca oca do shelter (teto incluso + miolo excluído), determinismo e guarda de dims inválidas.
import { test, expect } from 'bun:test'
import { genShelter, genWall, genTower, generateBlueprint, type BuildSpec } from './blueprints'

/** Conjunto de chaves "x,y,z" das posições de um blueprint (para asserts de presença/ausência). */
function posSet(bp: { pos: { x: number; y: number; z: number } }[]): Set<string> {
  return new Set(bp.map((b) => `${b.pos.x},${b.pos.y},${b.pos.z}`))
}

test('genShelter 3x3x3 fecha a casca: inclui o teto e exclui a célula interna central', () => {
  const spec: BuildSpec = { tipo: 'shelter', dims: { w: 3, h: 3, d: 3 }, origin: { x: 0, y: 64, z: 0 } }
  const bp = genShelter(spec)
  const keys = posSet(bp)

  // Teto: y === origin.y + (h-1) = 66 deve existir (canto do teto e centro do teto).
  expect(keys.has('1,66,1')).toBe(true) // centro do teto presente
  expect(bp.some((b) => b.pos.y === 66)).toBe(true)

  // Miolo (oco): a célula interna central (1,65,1) NÃO é borda → não está na lista.
  expect(keys.has('1,65,1')).toBe(false)

  // Chão presente (y === origin.y = 64).
  expect(keys.has('1,64,1')).toBe(true)

  // Casca de 3x3x3 = 27 células totais - 1 interna = 26 posições.
  expect(bp.length).toBe(26)

  // bloco default = cobblestone.
  expect(bp.every((b) => b.bloco === 'cobblestone')).toBe(true)
})

test('genShelter fecha os 6 vizinhos da célula central (sem buraco)', () => {
  const spec: BuildSpec = { tipo: 'shelter', dims: { w: 3, h: 3, d: 3 }, origin: { x: 0, y: 64, z: 0 } }
  const keys = posSet(genShelter(spec))
  // Vizinhos da célula central (1,65,1): chão, teto, 4 paredes.
  expect(keys.has('1,64,1')).toBe(true) // abaixo (chão)
  expect(keys.has('1,66,1')).toBe(true) // acima (teto)
  expect(keys.has('0,65,1')).toBe(true) // -x
  expect(keys.has('2,65,1')).toBe(true) // +x
  expect(keys.has('1,65,0')).toBe(true) // -z
  expect(keys.has('1,65,2')).toBe(true) // +z
})

test('genShelter aceita bloco custom', () => {
  const spec: BuildSpec = { tipo: 'shelter', dims: { w: 3, h: 3, d: 3 }, origin: { x: 0, y: 64, z: 0 }, bloco: 'oak_planks' }
  const bp = genShelter(spec)
  expect(bp.every((b) => b.bloco === 'oak_planks')).toBe(true)
})

test('genWall 5x3 produz um plano de 15 posições', () => {
  const spec: BuildSpec = { tipo: 'wall', dims: { w: 5, h: 3, d: 1 }, origin: { x: 10, y: 70, z: 5 } }
  const bp = genWall(spec)
  expect(bp.length).toBe(15)
  // Plano ao longo de x (w >= d): z fixo em origin.z.
  expect(bp.every((b) => b.pos.z === 5)).toBe(true)
  expect(bp.some((b) => b.pos.x === 10 && b.pos.y === 70)).toBe(true)
  expect(bp.some((b) => b.pos.x === 14 && b.pos.y === 72)).toBe(true)
})

test('genTower 1x4 produz uma coluna de 4 posições para cima', () => {
  const spec: BuildSpec = { tipo: 'tower', dims: { w: 1, h: 4, d: 1 }, origin: { x: 0, y: 64, z: 0 } }
  const bp = genTower(spec)
  expect(bp.length).toBe(4)
  const ys = bp.map((b) => b.pos.y).sort((a, b) => a - b)
  expect(ys).toEqual([64, 65, 66, 67])
  expect(bp.every((b) => b.pos.x === 0 && b.pos.z === 0)).toBe(true)
})

test('determinismo: mesmo spec → mesma lista (mesma ordem)', () => {
  const spec: BuildSpec = { tipo: 'shelter', dims: { w: 3, h: 3, d: 3 }, origin: { x: 0, y: 64, z: 0 } }
  const a = genShelter(spec)
  const b = genShelter(spec)
  expect(JSON.stringify(a)).toBe(JSON.stringify(b))
})

test('dims inválidas (w=0) → lista vazia, nunca lança', () => {
  expect(genShelter({ tipo: 'shelter', dims: { w: 0, h: 3, d: 3 }, origin: { x: 0, y: 64, z: 0 } })).toEqual([])
  expect(genWall({ tipo: 'wall', dims: { w: 5, h: 0, d: 1 }, origin: { x: 0, y: 64, z: 0 } })).toEqual([])
  expect(genTower({ tipo: 'tower', dims: { w: 1, h: -2, d: 1 }, origin: { x: 0, y: 64, z: 0 } })).toEqual([])
})

test('generateBlueprint delega por tipo e retorna [] para tipo desconhecido', () => {
  const shelterBp = generateBlueprint({ tipo: 'shelter', dims: { w: 3, h: 3, d: 3 }, origin: { x: 0, y: 64, z: 0 } })
  expect(shelterBp.length).toBe(26)
  const wallBp = generateBlueprint({ tipo: 'wall', dims: { w: 5, h: 3, d: 1 }, origin: { x: 0, y: 64, z: 0 } })
  expect(wallBp.length).toBe(15)
  // Tipo desconhecido → [] (casts para forçar o caminho default).
  const unknown = generateBlueprint({ tipo: 'pyramid' as unknown as BuildSpec['tipo'], dims: { w: 1, h: 1, d: 1 }, origin: { x: 0, y: 0, z: 0 } })
  expect(unknown).toEqual([])
})
