// src/cognition/trigger-bus.test.ts
// Fase 8 — regressão do hostileNearby. O debounce TRAILING antigo era starvado por entityMoved
// de alta frequência (mob em movimento ⇒ timer reiniciado pra sempre ⇒ emit nunca acontecia).
// O fix é um throttle LEADING-EDGE: emite na 1ª detecção e no máximo 1x por hostileDebounceMs.
import { test, expect } from 'bun:test'
import { EventEmitter } from 'node:events'
import { TriggerBus, type TriggerConfig } from './trigger-bus'

const CFG: TriggerConfig = {
  hostileRadius: 16,
  hostileDebounceMs: 800,
  hungryThreshold: 16,
  healthCriticalThreshold: 10,
  healthExitThreshold: 14,
  oxygenEmergeThreshold: 4,
  oxygenExitThreshold: 12,
  fallDangerBlocks: 3,
  lavaLookahead: 2,
}

/** Posição mínima com distanceTo (evita depender de vec3). */
function pos(x: number, y: number, z: number) {
  return {
    x, y, z,
    distanceTo(o: { x: number; y: number; z: number }) {
      return Math.hypot(x - o.x, y - o.y, z - o.z)
    },
  }
}

/** Mock de bot: EventEmitter + entity/entities. Só 'entityMoved' é disparado nos testes. */
function makeBot(entities: Record<string, { kind?: string; position: ReturnType<typeof pos> }>) {
  const bot = new EventEmitter() as unknown as {
    on: EventEmitter['on']; emit: EventEmitter['emit']; off: EventEmitter['off']
    entity: { position: ReturnType<typeof pos> }
    entities: typeof entities
  }
  bot.entity = { position: pos(0, 64, 0) }
  bot.entities = entities
  return bot
}

test('regressão: hostileNearby dispara JÁ na 1ª detecção (não é starvado por entityMoved)', () => {
  const bus = new TriggerBus()
  const zombie = { kind: 'Hostile mobs', position: pos(1, 64, 0) } // d=1, dentro do raio
  const bot = makeBot({ z: zombie })
  const cleanup = bus.setupMineflayerListeners(bot as never, CFG)

  let emits = 0
  bus.on('hostileNearby', () => { emits++ })

  // Simula o mob se aproximando: entityMoved a alta frequência (como no jogo real).
  // Com o bug do trailing-debounce, emits ficaria 0 (timer sempre reiniciado). Com o fix, ≥1.
  for (let i = 0; i < 30; i++) bot.emit('entityMoved' as never)

  expect(emits).toBeGreaterThanOrEqual(1)
  cleanup()
})

test('não dispara quando o hostil está fora do raio', () => {
  const bus = new TriggerBus()
  const zombie = { kind: 'Hostile mobs', position: pos(100, 64, 0) } // d=100, fora do raio
  const bot = makeBot({ z: zombie })
  const cleanup = bus.setupMineflayerListeners(bot as never, CFG)

  let emits = 0
  bus.on('hostileNearby', () => { emits++ })
  for (let i = 0; i < 10; i++) bot.emit('entityMoved' as never)

  expect(emits).toBe(0)
  cleanup()
})

test('throttle: rajada de entityMoved não emite mais de 1x dentro da janela', () => {
  const bus = new TriggerBus()
  const zombie = { kind: 'Hostile mobs', position: pos(2, 64, 0) }
  const bot = makeBot({ z: zombie })
  const cleanup = bus.setupMineflayerListeners(bot as never, CFG)

  let emits = 0
  bus.on('hostileNearby', () => { emits++ })
  // 50 moves numa rajada (bem dentro de hostileDebounceMs=800ms) ⇒ exatamente 1 emit (leading-edge).
  for (let i = 0; i < 50; i++) bot.emit('entityMoved' as never)

  expect(emits).toBe(1)
  cleanup()
})
