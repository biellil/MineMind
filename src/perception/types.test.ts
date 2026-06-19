import { describe, it, expect } from 'bun:test'
import type { WorldSnapshot, EntityInfo, PlayerInfo, BlockSummary, InventorySlot, BotStatus, Position3D, LookingAtBlock } from './types'

describe('WorldSnapshot type contract', () => {
  it('pode construir um WorldSnapshot válido (contrato de integração Fase 1→2)', () => {
    const pos: Position3D = { x: 10, y: 64, z: -5 }

    const status: BotStatus = {
      health: 20,
      food: 20,
      position: pos,
      timeOfDay: 0.3,
      isDay: true,
    }

    const entity: EntityInfo = {
      id: 1,
      type: 'mob',
      name: 'Creeper',
      position: { x: 12, y: 64, z: -5 },
      distance: 2.0,
      health: 20,
      metadata: null,
    }

    const player: PlayerInfo = {
      username: 'Steve',
      displayName: 'Steve',
      gamemode: 0,
      ping: 10,
      position: { x: 15, y: 64, z: -5 },
      distance: 5.0,
    }

    const block: BlockSummary = {
      count: 10,
      examples: [{ x: 11, y: 63, z: -5 }],
    }

    const slot: InventorySlot = {
      slot: 36,
      name: 'diamond_sword',
      type: 276,
      count: 1,
      metadata: 0,
      nbt: null,
    }

    const lookingAt: LookingAtBlock = {
      name: 'oak_log',
      position: { x: 11, y: 64, z: -5 },
      distance: 3.0,
    }

    const snapshot: WorldSnapshot = {
      capturedAt: Date.now(),
      status,
      entities: [entity],
      players: [player],
      nearbyBlockTypes: { stone: block },
      inventory: [slot],
      lookingAt,
      underfoot: 'grass_block',
    }

    expect(snapshot.status.health).toBe(20)
    expect(snapshot.entities).toHaveLength(1)
    expect(snapshot.players[0].username).toBe('Steve')
    expect(snapshot.nearbyBlockTypes.stone.count).toBe(10)
    expect(snapshot.inventory[0].name).toBe('diamond_sword')
    expect(snapshot.lookingAt?.name).toBe('oak_log')
    expect(snapshot.underfoot).toBe('grass_block')
  })

  it('lookingAt pode ser null quando não há bloco na mira (NOVO)', () => {
    const snapshot: WorldSnapshot = {
      capturedAt: Date.now(),
      status: { health: 20, food: 20, position: { x: 0, y: 64, z: 0 }, timeOfDay: 0.3, isDay: true },
      entities: [],
      players: [],
      nearbyBlockTypes: {},
      inventory: [],
      lookingAt: null,
      underfoot: 'air',
    }

    expect(snapshot.lookingAt).toBeNull()
    expect(snapshot.underfoot).toBe('air')
  })

  it('snapshot congelado é imutável em runtime (D-10)', () => {
    const snapshot: WorldSnapshot = Object.freeze(structuredClone({
      capturedAt: 1000,
      status: { health: 20, food: 20, position: { x: 0, y: 64, z: 0 }, timeOfDay: 0.3, isDay: true },
      entities: [],
      players: [],
      nearbyBlockTypes: {},
      inventory: [],
      lookingAt: null,
      underfoot: 'stone',
    }))

    expect(() => {
      (snapshot as Record<string, unknown>).capturedAt = 9999
    }).toThrow()
  })
})
