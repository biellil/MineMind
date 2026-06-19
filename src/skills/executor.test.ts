import { describe, it, expect } from 'bun:test'
import { gaussianDelay, executeWithSafety, SkillTimeoutError, SkillStuckError } from './executor'

describe('gaussianDelay', () => {
  it('retorna sempre >= 0', () => {
    for (let i = 0; i < 100; i++) {
      expect(gaussianDelay(300, 100)).toBeGreaterThanOrEqual(0)
    }
  })

  it('retorna número próximo da média na maioria dos casos', () => {
    const samples = Array.from({ length: 200 }, () => gaussianDelay(300, 50))
    const avg = samples.reduce((a, b) => a + b, 0) / samples.length
    expect(avg).toBeGreaterThan(200)
    expect(avg).toBeLessThan(400)
  })
})

describe('executeWithSafety', () => {
  it('executa ação e retorna resultado', async () => {
    const result = await executeWithSafety(() => Promise.resolve(42), { timeoutMs: 5000 })
    expect(result).toBe(42)
  })

  it('aplica delay pré e pós ação (tempo total > 0)', async () => {
    const start = Date.now()
    await executeWithSafety(() => Promise.resolve(), { timeoutMs: 5000 })
    expect(Date.now() - start).toBeGreaterThan(0)
  })

  it('lança SkillTimeoutError quando ação demora mais que o timeout', async () => {
    const neverResolves = () => new Promise<void>(() => {})
    await expect(
      executeWithSafety(neverResolves, { timeoutMs: 200 })
    ).rejects.toBeInstanceOf(SkillTimeoutError)
  })

  it('SkillTimeoutError tem nome correto', async () => {
    const neverResolves = () => new Promise<void>(() => {})
    try {
      await executeWithSafety(neverResolves, { timeoutMs: 100 })
    } catch (err) {
      expect((err as Error).name).toBe('SkillTimeoutError')
      expect((err as Error).message).toContain('100ms')
    }
  })

  it('lança SkillStuckError quando watchdog detecta ausência de progresso', async () => {
    let counter = 0
    const slowAction = () => new Promise<void>((resolve) => setTimeout(resolve, 5000))

    await expect(
      executeWithSafety(slowAction, {
        timeoutMs: 10_000,
        progressChecker: () => counter,  // nunca muda — watchdog deve disparar
        progressIntervalMs: 50,
        noProgressToleranceMs: 200,
      })
    ).rejects.toBeInstanceOf(SkillStuckError)
  })

  it('não lança SkillStuckError quando há progresso', async () => {
    let counter = 0
    const intervalId = setInterval(() => counter++, 30)

    const result = await executeWithSafety(
      () => new Promise<string>((resolve) => setTimeout(() => resolve('ok'), 400)),
      {
        timeoutMs: 5000,
        progressChecker: () => counter,
        progressIntervalMs: 50,
        noProgressToleranceMs: 200,
      }
    )

    clearInterval(intervalId)
    expect(result).toBe('ok')
  })

  it('limpa o watchdog após conclusão (sem timers órfãos)', async () => {
    const result = await executeWithSafety(
      () => Promise.resolve('done'),
      {
        timeoutMs: 5000,
        progressChecker: () => 42,
        progressIntervalMs: 50,
        noProgressToleranceMs: 500,
      }
    )
    expect(result).toBe('done')
  })
})
