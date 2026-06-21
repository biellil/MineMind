// src/motivation/tech-tree.test.ts
// Testes unitários do DAG resolver para tech-tree (TECH-01/D-01..D-05).
// Módulo PURO — mock bot sem servidor Minecraft.
import { test, expect } from 'bun:test'
import { resolveDag, SMELT_MAP } from './tech-tree'
import type { Bot } from 'mineflayer'

// ---------------------------------------------------------------------------
// Mock bot mínimo para testes unitários (sem conexão ao Minecraft)
// ---------------------------------------------------------------------------

const ITEMS_BY_NAME: Record<string, { id: number }> = {
  oak_log:          { id: 17 },
  oak_planks:       { id: 5 },
  stick:            { id: 280 },
  crafting_table:   { id: 58 },
  wooden_pickaxe:   { id: 270 },
  cobblestone:      { id: 4 },
  stone_pickaxe:    { id: 274 },
  iron_ore:         { id: 15 },
  iron_ingot:       { id: 265 },
  iron_pickaxe:     { id: 257 },
  furnace:          { id: 61 },
  coal:             { id: 263 },
  coal_ore:         { id: 16 },
}

const ITEMS_BY_ID: Record<number, { name: string }> = Object.fromEntries(
  Object.entries(ITEMS_BY_NAME).map(([name, { id }]) => [id, { name }])
)

// Receitas simplificadas para testes:
// delta: count < 0 = ingrediente consumido; count > 0 = produzido
const RECIPES: Record<number, Array<{ delta: Array<{ id: number; count: number }>; requiresTable: boolean }>> = {
  // oak_planks: precisa de oak_log, NÃO precisa de mesa (2x2)
  [5]: [{ delta: [{ id: 17, count: -1 }, { id: 5, count: 4 }], requiresTable: false }],

  // stick: precisa de oak_planks, NÃO precisa de mesa
  [280]: [{ delta: [{ id: 5, count: -2 }, { id: 280, count: 4 }], requiresTable: false }],

  // crafting_table: precisa de oak_planks, NÃO precisa de mesa
  [58]: [{ delta: [{ id: 5, count: -4 }, { id: 58, count: 1 }], requiresTable: false }],

  // wooden_pickaxe: precisa de oak_planks + stick, PRECISA de mesa (3x3)
  [270]: [{ delta: [{ id: 5, count: -3 }, { id: 280, count: -2 }, { id: 270, count: 1 }], requiresTable: true }],

  // iron_pickaxe: precisa de iron_ingot + stick, PRECISA de mesa (3x3)
  [257]: [{ delta: [{ id: 265, count: -3 }, { id: 280, count: -2 }, { id: 257, count: 1 }], requiresTable: true }],

  // furnace: precisa de cobblestone, PRECISA de mesa (3x3)
  [61]: [{ delta: [{ id: 4, count: -8 }, { id: 61, count: 1 }], requiresTable: true }],

  // coal via smelting — NAO deve aparecer aqui (smelt map tem prioridade)
  // mas adicionamos como receita errada para garantir que smelt map é verificado primeiro:
  // iron_ingot também tem receita de crafting (9 iron_nuggets) — simulamos com delta vazio
  // para garantir que o smelt map seja consultado ANTES:
  [265]: [],  // iron_ingot: receitas de crafting existem mas retornamos [] (smelt map tem prioridade)
}

const mockBot = {
  registry: {
    itemsByName: ITEMS_BY_NAME,
    items: ITEMS_BY_ID,
  },
  recipesAll: (itemId: number, _meta: null, _craftingTable: boolean) => {
    return RECIPES[itemId] ?? []
  },
} as unknown as Bot

// ---------------------------------------------------------------------------
// Testes
// ---------------------------------------------------------------------------

// Teste 1: item sem receita (oak_log) → fallback gather
test('resolveDag: item sem receita (oak_log) retorna [gather:oak_log] com dependsOn vazio', () => {
  const result = resolveDag('oak_log', mockBot)
  expect(Array.isArray(result)).toBe(true)
  const goals = result as import('./types').Goal[]
  expect(goals).toHaveLength(1)
  expect(goals[0]!.id).toBe('gather:oak_log')
  expect(goals[0]!.kind).toBe('gather')
  expect(goals[0]!.dependsOn).toEqual([])
})

// Teste 2: craft com dependência (oak_planks → gather:oak_log → craft:oak_planks)
test('resolveDag: oak_planks retorna [gather:oak_log, craft:oak_planks] com dependsOn correto', () => {
  const result = resolveDag('oak_planks', mockBot)
  expect(Array.isArray(result)).toBe(true)
  const goals = result as import('./types').Goal[]

  // Deve ter ao menos 2 goals (gather:oak_log e craft:oak_planks)
  const gatherLog = goals.find(g => g.id === 'gather:oak_log')
  const craftPlanks = goals.find(g => g.id === 'craft:oak_planks')
  expect(gatherLog).toBeDefined()
  expect(craftPlanks).toBeDefined()

  // craft:oak_planks depende de gather:oak_log
  expect(craftPlanks!.dependsOn).toContain('gather:oak_log')

  // Ordem topológica: gather vem antes de craft
  const gatherIdx = goals.findIndex(g => g.id === 'gather:oak_log')
  const craftIdx  = goals.findIndex(g => g.id === 'craft:oak_planks')
  expect(gatherIdx).toBeLessThan(craftIdx)
})

// Teste 3: smelt map — iron_ingot vai pelo smelt map (não ciclo)
test('resolveDag: iron_ingot usa smelt map — retorna [gather:iron_ore, smelt:iron_ore] SEM ciclo', () => {
  const result = resolveDag('iron_ingot', mockBot)
  expect(Array.isArray(result)).toBe(true)
  const goals = result as import('./types').Goal[]

  // NÃO deve ter 'gather:iron_ingot' (não é coletável diretamente)
  // DEVE ter gather:iron_ore e smelt:iron_ore
  const gatherOre  = goals.find(g => g.id === 'gather:iron_ore')
  const smeltOre   = goals.find(g => g.id === 'smelt:iron_ore')
  expect(gatherOre).toBeDefined()
  expect(smeltOre).toBeDefined()

  // smelt:iron_ore depende de gather:iron_ore
  expect(smeltOre!.dependsOn).toContain('gather:iron_ore')

  // Não deve ter ciclo (iron_ingot não aparece nos sub-goals de smelt:iron_ore)
  expect(goals.find(g => g.id === 'craft:iron_ingot')).toBeUndefined()
})

// Teste 4: cap de profundidade retorna { unresolvable: true }
test('resolveDag: depth=8 retorna { unresolvable: true }', () => {
  const result = resolveDag('oak_planks', mockBot, new Map(), 8)
  expect(result).toEqual({ unresolvable: true })
})

// Teste 5: memo previne re-resolução dupla
test('resolveDag: memo compartilhado previne recursão dupla para mesmo item', () => {
  const memo = new Map<string, import('./tech-tree').DagResult>()

  // Primeira chamada: resolve e salva no memo
  const r1 = resolveDag('oak_log', mockBot, memo)
  expect(Array.isArray(r1)).toBe(true)
  expect(memo.has('oak_log')).toBe(true)

  // Segunda chamada com MESMO memo: deve retornar resultado cacheado
  const r2 = resolveDag('oak_log', mockBot, memo)
  expect(r2).toBe(r1) // mesma referência (retorno do memo)
})

// Teste 6: receita requiresTable=true adiciona sub-goal 'ensure:crafting_table'
test('resolveDag: wooden_pickaxe (requiresTable=true) inclui ensure:crafting_table nos sub-goals', () => {
  const result = resolveDag('wooden_pickaxe', mockBot)
  expect(Array.isArray(result)).toBe(true)
  const goals = result as import('./types').Goal[]

  const ensureTable = goals.find(g => g.id === 'ensure:crafting_table')
  expect(ensureTable).toBeDefined()
  expect(ensureTable!.kind).toBe('ensure')

  // O goal de craft:wooden_pickaxe deve depender de ensure:crafting_table
  const craftPickaxe = goals.find(g => g.id === 'craft:wooden_pickaxe')
  expect(craftPickaxe).toBeDefined()
  expect(craftPickaxe!.dependsOn).toContain('ensure:crafting_table')
})

// Teste extra: SMELT_MAP exportado e contém os mapeamentos críticos
test('SMELT_MAP exportado contém iron_ingot → iron_ore', () => {
  expect(SMELT_MAP['iron_ingot']).toBe('iron_ore')
  expect(SMELT_MAP['copper_ingot']).toBe('raw_copper')
  expect(SMELT_MAP['gold_ingot']).toBe('raw_gold')
})
