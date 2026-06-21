import { describe, it, expect } from 'bun:test'
import { NavigateSchema } from './navigate'
import { DigSchema } from './dig'
import { FollowSchema } from './follow'
import { AttackSchema } from './attack'
import { skillRegistry, toolRegistry } from './index'

describe('NavigateSchema', () => {
  it('aceita coordenadas XYZ', () => {
    const result = NavigateSchema.parse({ target: { x: 10, y: 64, z: -5 } })
    expect(result.target).toEqual({ x: 10, y: 64, z: -5 })
    expect(result.range).toBe(2)  // default
  })

  it('aceita nome de bloco como string', () => {
    const result = NavigateSchema.parse({ target: 'oak_log', range: 3 })
    expect(result.target).toBe('oak_log')
    expect(result.range).toBe(3)
  })

  it('rejeita string maior que 64 caracteres', () => {
    expect(() => NavigateSchema.parse({ target: 'a'.repeat(65) })).toThrow()
  })

  it('rejeita range fora de 1-10', () => {
    expect(() => NavigateSchema.parse({ target: 'stone', range: 0 })).toThrow()
    expect(() => NavigateSchema.parse({ target: 'stone', range: 11 })).toThrow()
  })

  it('tem toJSONSchema() (Zod v4 built-in)', () => {
    const schema = NavigateSchema.toJSONSchema()
    expect(schema).toBeDefined()
    expect(typeof schema).toBe('object')
  })
})

describe('DigSchema', () => {
  it('aceita posição XYZ', () => {
    const result = DigSchema.parse({ target: { x: 0, y: 60, z: 0 } })
    expect(result.count).toBe(1)  // default
  })

  it('aceita nome de bloco com count', () => {
    const result = DigSchema.parse({ target: 'coal_ore', count: 5 })
    expect(result.target).toBe('coal_ore')
    expect(result.count).toBe(5)
  })

  it('rejeita count fora de 1-64', () => {
    expect(() => DigSchema.parse({ target: 'stone', count: 0 })).toThrow()
    expect(() => DigSchema.parse({ target: 'stone', count: 65 })).toThrow()
  })

  it('rejeita count não-inteiro', () => {
    expect(() => DigSchema.parse({ target: 'stone', count: 1.5 })).toThrow()
  })
})

describe('FollowSchema', () => {
  it('aceita entityName com maxDistance default', () => {
    const result = FollowSchema.parse({ entityName: 'Steve' })
    expect(result.maxDistance).toBe(3)
  })
})

describe('AttackSchema', () => {
  it('aceita entityName', () => {
    const result = AttackSchema.parse({ entityName: 'Creeper' })
    expect(result.entityName).toBe('Creeper')
  })

  it('rejeita entityName maior que 64 caracteres', () => {
    expect(() => AttackSchema.parse({ entityName: 'x'.repeat(65) })).toThrow()
  })
})

describe('skillRegistry', () => {
  it('contém as 11 skills (7 base + placeBlock/craft/smelt/equip da Fase 9)', () => {
    expect(Object.keys(skillRegistry)).toEqual([
      'navigate', 'dig', 'follow', 'attack', 'eat', 'flee', 'shelter',
      'placeBlock', 'craft', 'smelt', 'equip',
    ])
  })

  it('todas as entries são funções', () => {
    for (const fn of Object.values(skillRegistry)) {
      expect(typeof fn).toBe('function')
    }
  })
})

describe('toolRegistry', () => {
  it('contém 11 tool descriptors', () => {
    expect(toolRegistry).toHaveLength(11)
  })

  it('todos os descriptors têm name, description, schema, execute', () => {
    for (const tool of toolRegistry) {
      expect(typeof tool.name).toBe('string')
      expect(typeof tool.description).toBe('string')
      expect(typeof tool.schema.parse).toBe('function')
      expect(typeof tool.execute).toBe('function')
    }
  })

  it('nomes dos tools: 7 base + placeBlock, craft, smelt, equip', () => {
    expect(toolRegistry.map((t) => t.name)).toEqual([
      'navigate', 'dig', 'follow', 'attack', 'eat', 'flee', 'shelter',
      'placeBlock', 'craft', 'smelt', 'equip',
    ])
  })
})
