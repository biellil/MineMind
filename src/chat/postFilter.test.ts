// src/chat/postFilter.test.ts
// Fase 7 D-09 C / D-10 — testes do post-filter determinístico de quantidade/coleta.
// Verifica a reescrita pt-BR "peguei N" → número grounded, e os no-ops (sem padrão / fact null).
import { describe, it, expect } from 'bun:test'
import type { ObservedDeltaFact } from './postFilter'
import { reconcileQuantities } from './postFilter'

/** Helper: constrói um ObservedDeltaFact literal. */
function fact(
  observed: number,
  outcome: ObservedDeltaFact['outcome'] = 'partial',
  delta: Record<string, number> = {},
): ObservedDeltaFact {
  return { skill: 'dig', observed, outcome, delta }
}

describe('reconcileQuantities', () => {
  it('caso âncora: "Peguei 10 tábuas" com observed=3 vira "Peguei 3 tábuas" (D-10)', () => {
    const out = reconcileQuantities('Peguei 10 tábuas!', fact(3))
    expect(out).toContain('3')
    expect(out).not.toContain('10')
    expect(out).toBe('Peguei 3 tábuas!')
  })

  it('números que batem: "Peguei 3 tábuas" com observed=3 passa inalterado', () => {
    const out = reconcileQuantities('Peguei 3 tábuas', fact(3))
    expect(out).toBe('Peguei 3 tábuas')
  })

  it('sem padrão de quantidade: "Que dia bonito" passa inalterado', () => {
    const out = reconcileQuantities('Que dia bonito', fact(3))
    expect(out).toBe('Que dia bonito')
  })

  it('fact=null: passa inalterado (sem delta autoritativo)', () => {
    const out = reconcileQuantities('Peguei 10 tábuas', null)
    expect(out).toBe('Peguei 10 tábuas')
  })

  it('no_effect (observed=0): "coletei 10 troncos" vira "coletei 0 troncos"', () => {
    const out = reconcileQuantities('coletei 10 troncos', fact(0, 'no_effect'))
    expect(out).toBe('coletei 0 troncos')
    expect(out).not.toContain('10')
  })

  it('cobre variantes pt-BR de verbo de coleta (minerei/consegui/obtive/juntei)', () => {
    expect(reconcileQuantities('minerei 8 pedras', fact(2))).toBe('minerei 2 pedras')
    expect(reconcileQuantities('consegui 5 maçãs', fact(1))).toBe('consegui 1 maçãs')
    expect(reconcileQuantities('obtive 9 ferros', fact(4))).toBe('obtive 4 ferros')
    expect(reconcileQuantities('juntei 7 gravetos', fact(0, 'no_effect'))).toBe('juntei 0 gravetos')
  })

  it('case-insensitive: "PEGUEI 10" reconcilia mantendo o verbo da fala', () => {
    const out = reconcileQuantities('PEGUEI 10 blocos', fact(3))
    expect(out).toContain('3')
    expect(out).not.toContain('10')
  })

  it('reescreve múltiplas ocorrências na mesma fala', () => {
    const out = reconcileQuantities('Peguei 10 tábuas e coletei 5 troncos', fact(2))
    expect(out).toBe('Peguei 2 tábuas e coletei 2 troncos')
  })
})
