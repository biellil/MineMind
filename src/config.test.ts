import { describe, it, expect } from 'bun:test'

// config.ts é um singleton avaliado no PRIMEIRO import (e cacheado pelo runtime). Para afirmar os
// DEFAULTS do código de forma determinística, removemos overrides do .env local ANTES de qualquer
// import de ./config (o .env de dev seta SURVIVAL_CRITICAL_THRESHOLD=0.3, mascarando o default 0.5).
for (const k of [
  'SURVIVAL_CRITICAL_THRESHOLD', 'HUNGRY_THRESHOLD', 'HEALTH_CRITICAL_THRESHOLD',
  'OXYGEN_EMERGE_THRESHOLD', 'FALL_DANGER_BLOCKS', 'LAVA_LOOKAHEAD',
  'CREEPER_REACT_DISTANCE', 'RANGED_REACT_DISTANCE',
  'LLM_MAX_CONCURRENCY_LOCAL', 'LLM_MAX_CONCURRENCY_CLOUD',
]) delete process.env[k]

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

describe('config — limiares reflexos Fase 8', () => {
  it('defaults dos limiares de sobrevivência (D-11..D-14)', async () => {
    const { config } = await import('./config')
    expect(config.hungryThreshold).toBe(16)
    expect(config.survivalCriticalThreshold).toBe(0.5)
    expect(config.healthCriticalThreshold).toBe(10)
    expect(config.oxygenEmergeThreshold).toBe(6)
    expect(config.fallDangerBlocks).toBe(3)
    expect(config.lavaLookahead).toBe(2)
    expect(config.creeperReactDistance).toBe(10)
    expect(config.rangedReactDistance).toBe(16)
  })
})

describe('config — concorrência LLM Fase 10.1', () => {
  it('defaults do teto de concorrência (D-07/D-09): local=4, cloud=3', async () => {
    const { config } = await import('./config')
    expect(config.llmMaxConcurrencyLocal).toBe(4)
    expect(config.llmMaxConcurrencyCloud).toBe(3)
  })
})
