// src/skills/tool-selector.test.ts
// Testes unitários do selectToolFor ranqueado por tier (D-12 Fase 10).
// Verifica que a função retorna a ferramenta de maior tier e null quando inventário vazio.
import { describe, test, expect } from 'bun:test'
import { selectToolFor, TOOL_TIER } from './tool-selector'

// Mock mínimo de Bot.inventory para testes unitários
function makeMockBot(itemNames: string[]) {
  return {
    inventory: {
      items: () => itemNames.map((name) => ({ name, count: 1 })),
    },
  } as any
}

describe('selectToolFor — ranking por tier (D-12 Fase 10)', () => {
  test('Teste A: inventário com wooden_pickaxe + iron_pickaxe → retorna iron_pickaxe (tier 3 > tier 1)', () => {
    const bot = makeMockBot(['wooden_pickaxe', 'iron_pickaxe'])
    const result = selectToolFor(bot, 'pickaxe')
    expect(result?.name).toBe('iron_pickaxe')
  })

  test('Teste B: inventário vazio → retorna null (sem ferramenta disponível)', () => {
    const bot = makeMockBot([])
    const result = selectToolFor(bot, 'pickaxe')
    expect(result).toBeNull()
  })

  test('Teste C: category=blockName (oak_log → axe) — retorna iron_axe quando disponível', () => {
    const bot = makeMockBot(['wooden_axe', 'iron_axe'])
    const result = selectToolFor(bot, 'oak_log')
    expect(result?.name).toBe('iron_axe')
  })

  test('Teste D: category=blockName (iron_ore → pickaxe) — retorna stone_pickaxe sobre wooden_pickaxe', () => {
    const bot = makeMockBot(['wooden_pickaxe', 'stone_pickaxe'])
    const result = selectToolFor(bot, 'iron_ore')
    expect(result?.name).toBe('stone_pickaxe')
  })

  test('Teste E: inventário com somente wooden_pickaxe → retorna wooden_pickaxe (tier 1)', () => {
    const bot = makeMockBot(['wooden_pickaxe'])
    const result = selectToolFor(bot, 'pickaxe')
    expect(result?.name).toBe('wooden_pickaxe')
  })

  test('Teste F: TOOL_TIER — iron_pickaxe tier 3 > stone_pickaxe tier 2 > wooden_pickaxe tier 1', () => {
    expect(TOOL_TIER['iron_pickaxe']).toBe(3)
    expect(TOOL_TIER['stone_pickaxe']).toBe(2)
    expect(TOOL_TIER['wooden_pickaxe']).toBe(1)
    expect(TOOL_TIER['diamond_pickaxe']).toBe(4)
    expect(TOOL_TIER['netherite_pickaxe']).toBe(5)
  })
})
