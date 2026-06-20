// src/skills/attack.test.ts
// Plan 08-02 / D-15 / SURV-02 (defesa): attack 1-shot real — UM golpe via bot.attack, sem
// perseguir, sem manter alvo, sem pathfinder. Combate real (kiting/manter alvo) = Fase 13.
//
// Mock mínimo de Bot: bot.nearestEntity devolve um mock entity ou null; bot.attack é um spy
// que conta chamadas. Verifica grounding 1-shot e ausência de loop de perseguição.
import { test, expect } from 'bun:test'
import { attack } from './attack'

interface MockEntity {
  name?: string
  username?: string
}

/**
 * Cria um bot mockado com nearestEntity (com filtro) e bot.attack (spy).
 *
 * @param opts.entities entidades candidatas que nearestEntity vai filtrar
 */
function makeMockBot(opts: { entities: MockEntity[] }) {
  const attackCalls: MockEntity[] = []
  const bot: any = {
    nearestEntity: (filter?: (e: MockEntity) => boolean) => {
      const found = filter ? opts.entities.find(filter) : opts.entities[0]
      return found ?? null
    },
    attack: (entity: MockEntity) => {
      attackCalls.push(entity)
    },
  }
  return { bot, attackCalls }
}

test('alvo encontrado por name -> success + bot.attack chamado EXATAMENTE 1 vez (1-shot D-15)', async () => {
  const { bot, attackCalls } = makeMockBot({ entities: [{ name: 'zombie' }] })
  const r = await attack(bot, { entityName: 'zombie' })
  expect(r.outcome).toBe('success')
  expect(r.observed).toBe(1)
  expect(r.expected).toBe(1)
  expect(attackCalls.length).toBe(1)
})

test('alvo encontrado por username (jogador) -> success', async () => {
  const { bot, attackCalls } = makeMockBot({ entities: [{ username: 'Steve' }] })
  const r = await attack(bot, { entityName: 'Steve' })
  expect(r.outcome).toBe('success')
  expect(attackCalls.length).toBe(1)
})

test('alvo ausente -> no_effect + bot.attack NÃO chamado', async () => {
  const { bot, attackCalls } = makeMockBot({ entities: [{ name: 'cow' }] })
  const r = await attack(bot, { entityName: 'creeper' })
  expect(r.outcome).toBe('no_effect')
  expect(r.observed).toBe(0)
  expect(r.reason).toMatch(/não encontrado/i)
  expect(attackCalls.length).toBe(0)
})

test('não é mais stub: não retorna outcome error de "não implementada"', async () => {
  const { bot } = makeMockBot({ entities: [{ name: 'spider' }] })
  const r = await attack(bot, { entityName: 'spider' })
  expect(r.reason ?? '').not.toMatch(/não implementada/i)
})
