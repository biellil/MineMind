// src/grounding/evaluate.test.ts
// Fase 7 D-04/D-06 — testes PUROS do julgamento de sucesso por skill (sem bot/mock).
import { describe, it, expect } from 'bun:test'
import type { GroundState } from './types'
import { evaluateDig, evaluateNavigate } from './evaluate'

/** Helper: constrói um GroundState literal sem bot. */
function ground(itemsByName: Record<string, number>, pos = { x: 0, y: 0, z: 0 }): GroundState {
  const inventoryCount = Object.values(itemsByName).reduce((s, c) => s + c, 0)
  return {
    inventoryCount,
    itemsByName,
    position: pos,
    targetBlockName: null,
    capturedAt: 0,
  }
}

describe('evaluateDig', () => {
  it('success: delta == expected', () => {
    const before = ground({})
    const after = ground({ oak_planks: 10 })
    const r = evaluateDig(before, after, 10)
    expect(r.outcome).toBe('success')
    expect(r.observed).toBe(10)
    expect(r.expected).toBe(10)
    expect(r.delta).toEqual({ oak_planks: 10 })
  })

  it('success: delta > expected (ganhou mais que o pedido ainda é sucesso)', () => {
    const before = ground({ oak_log: 1 })
    const after = ground({ oak_log: 1, cobblestone: 5 })
    const r = evaluateDig(before, after, 3)
    expect(r.outcome).toBe('success')
    expect(r.observed).toBe(5)
  })

  it('partial: caso âncora — coletou 3 de 10 → observed:3, outcome:partial', () => {
    const before = ground({})
    const after = ground({ oak_planks: 3 })
    const r = evaluateDig(before, after, 10)
    expect(r.observed).toBe(3)
    expect(r.outcome).toBe('partial')
    expect(r.expected).toBe(10)
  })

  it('no_effect: delta zero → observed:0 (mata "peguei 10 tábuas")', () => {
    const before = ground({ oak_planks: 5 })
    const after = ground({ oak_planks: 5 })
    const r = evaluateDig(before, after, 10)
    expect(r.outcome).toBe('no_effect')
    expect(r.observed).toBe(0)
  })

  it('no_effect: só perdas de item não creditam coleta', () => {
    const before = ground({ apple: 3 })
    const after = ground({ apple: 1 })
    const r = evaluateDig(before, after, 2)
    expect(r.outcome).toBe('no_effect')
    expect(r.observed).toBe(0)
  })
})

describe('evaluateNavigate', () => {
  const target = { x: 10, y: 64, z: 10 }

  it('success: distância final <= range', () => {
    const before = ground({}, { x: 0, y: 64, z: 0 })
    const after = ground({}, { x: 10, y: 64, z: 11 })
    const r = evaluateNavigate(before, after, target, 2)
    expect(r.outcome).toBe('success')
    expect(r.observed).toBe(1)
    expect(r.expected).toBe(1)
  })

  it('partial: moveu mas não chegou ao range', () => {
    const before = ground({}, { x: 0, y: 64, z: 0 })
    const after = ground({}, { x: 5, y: 64, z: 5 })
    const r = evaluateNavigate(before, after, target, 2)
    expect(r.outcome).toBe('partial')
    expect(r.observed).toBe(0)
  })

  it('no_effect: posição idêntica (não saiu do lugar)', () => {
    const before = ground({}, { x: 0, y: 64, z: 0 })
    const after = ground({}, { x: 0, y: 64, z: 0 })
    const r = evaluateNavigate(before, after, target, 2)
    expect(r.outcome).toBe('no_effect')
    expect(r.observed).toBe(0)
  })
})
