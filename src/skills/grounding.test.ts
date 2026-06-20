// src/skills/grounding.test.ts
// Fase 7 Plan 02 — testes de CONTRATO das skills grounded (offline, sem servidor Minecraft).
//
// FOCO: o contrato de RETORNO (SkillResult) e o NÃO-LANÇAMENTO dos stubs (D-12).
// O julgamento de delta numérico (observed:3 de 10, etc.) já está coberto por
// src/grounding/evaluate.test.ts (Plan 01) — aqui não re-testamos a matemática do delta,
// apenas que dig/navigate produzem o SHAPE SkillResult e que stubs resolvem em vez de lançar.
import { describe, it, expect } from 'bun:test'
import { follow } from './follow'
import { attack } from './attack'
import { dig } from './dig'
import { navigate } from './navigate'
import type { SkillResult } from '../grounding/types'

/** Asserção de shape: o retorno tem as chaves obrigatórias do contrato SkillResult. */
function expectSkillResultShape(r: SkillResult): void {
  expect(typeof r.outcome).toBe('string')
  expect(['success', 'partial', 'no_effect', 'error']).toContain(r.outcome)
  expect(typeof r.observed).toBe('number')
  expect(typeof r.expected).toBe('number')
  expect(typeof r.delta).toBe('object')
}

/**
 * Fake-bot mínimo: mundo VAZIO (sem blocos/jogadores). dig/navigate caem no ramo de
 * pré-condição (bloco não encontrado → no_effect) SEM tocar pathfinder/collectBlock —
 * determinístico e offline. Espelha o makeMockBot de cognition/reconnect.test.ts.
 */
function makeEmptyBot(): any {
  const pos = { x: 0, y: 64, z: 0 }
  return {
    entity: { position: pos },
    inventory: { items: () => [] },
    findBlocks: () => [],
    findBlock: () => null,
    blockAt: () => null,
  }
}

describe('follow (stub) — contrato uniforme D-12', () => {
  it('RESOLVE (não rejeita) com outcome:error e reason de não-implementada', async () => {
    const r = await follow({} as any, { entityName: 'Steve', maxDistance: 3 })
    expectSkillResultShape(r)
    expect(r.outcome).toBe('error')
    expect(r.reason).toContain('não implementada')
  })

  it('params inválidos ainda rejeitam via Zod .parse (validação preservada)', async () => {
    await expect(follow({} as any, {})).rejects.toThrow()
  })
})

describe('attack (1-shot D-15) — contrato uniforme', () => {
  it('RESOLVE (não rejeita) com SkillResult; alvo ausente → no_effect (não throw)', async () => {
    const bot = { nearestEntity: () => null } as any
    const r = await attack(bot, { entityName: 'Zombie' })
    expectSkillResultShape(r)
    expect(r.outcome).toBe('no_effect')
    expect(r.observed).toBe(0)
    expect(r.reason).toContain('não encontrado')
  })

  it('params inválidos ainda rejeitam via Zod .parse (validação preservada)', async () => {
    await expect(attack({} as any, {})).rejects.toThrow()
  })
})

describe('dig — retorna SkillResult (shape do contrato)', () => {
  it('mundo vazio: dig por tipo resolve com SkillResult (no_effect, sem lançar)', async () => {
    const r = await dig(makeEmptyBot(), { target: 'oak_log', count: 1 })
    expectSkillResultShape(r)
    // Bloco inexistente → pré-condição vira no_effect (D-12: não throw).
    expect(r.outcome).toBe('no_effect')
    expect(r.observed).toBe(0)
    expect(r.expected).toBe(1)
  })

  it('params inválidos ainda rejeitam via Zod .parse (validação preservada)', async () => {
    await expect(dig(makeEmptyBot(), { target: 'oak_log', count: 0 })).rejects.toThrow()
  })
})

describe('navigate — retorna SkillResult (shape do contrato)', () => {
  it('mundo vazio: navigate por tipo resolve com SkillResult (no_effect, sem lançar)', async () => {
    const r = await navigate(makeEmptyBot(), { target: 'oak_log', range: 2 })
    expectSkillResultShape(r)
    // Bloco inexistente → pré-condição vira no_effect (D-12: não throw).
    expect(r.outcome).toBe('no_effect')
    expect(r.observed).toBe(0)
    expect(r.expected).toBe(1)
  })

  it('params inválidos ainda rejeitam via Zod .parse (validação preservada)', async () => {
    await expect(navigate(makeEmptyBot(), { target: { x: 0, y: 0 }, range: 2 })).rejects.toThrow()
  })
})
