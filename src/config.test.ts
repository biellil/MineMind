import { describe, it, expect } from 'bun:test'

describe('config', () => {
  it('carrega com valores default sem .env', async () => {
    const { config } = await import('./config')
    expect(config.host).toBe('localhost')
    expect(config.port).toBe(25565)
    expect(config.username).toBe('MineMind')
    expect(config.mcVersion).toBe('1.21.4')
    expect(config.perceptionRadius).toBe(32)
    expect(config.navigateTimeoutMs).toBe(30000)
    expect(config.digTimeoutMs).toBe(10000)
    expect(config.reconnectDelayMs).toBe(5000)
  })

  it('reconnectDelayMs é 5000 (fixo, não configurável via .env)', async () => {
    const { config } = await import('./config')
    expect(config.reconnectDelayMs).toBe(5000)
  })
})
