// src/memory/chromaClient.test.ts
// Prova o comportamento de DEGRADAÇÃO do cliente Chroma SEM um servidor real (passa offline/CI):
// abertura do breaker por threshold, cooldown→half-open→closed, timeout que não pendura e aviso
// debounced. Testa as unidades PURAS (withBreaker/withTimeout/warnOfflineDebounced/createBreaker)
// com relógio injetável — sem rede, sem mocks do cliente Chroma.
import { describe, test, expect, mock } from 'bun:test'
import { config } from '../config'
import {
  createBreaker,
  withBreaker,
  withTimeout,
  warnOfflineDebounced,
} from './chromaClient'

const fail = () => Promise.reject(new Error('boom'))
const ok = (v: number) => () => Promise.resolve(v)

describe('withBreaker — abertura por threshold', () => {
  test('N falhas (>= chromaFailThreshold) abrem o breaker e a chamada seguinte retorna fallback sem invocar fn', async () => {
    const b = createBreaker()
    let calls = 0
    const fn = () => {
      calls += 1
      return Promise.reject(new Error('boom'))
    }
    // Acumula falhas até o threshold.
    for (let i = 0; i < config.chromaFailThreshold; i++) {
      const r = await withBreaker(b, fn, -1, 1000)
      expect(r).toBe(-1) // sempre o fallback, nunca lança
    }
    expect(b.state).toBe('open')
    expect(calls).toBe(config.chromaFailThreshold)

    // Aberto e dentro do cooldown: NÃO chama fn, devolve fallback.
    const callsBefore = calls
    const r = await withBreaker(b, fn, -1, 1000) // mesmo "now" → ainda no cooldown
    expect(r).toBe(-1)
    expect(calls).toBe(callsBefore) // fn NÃO foi chamado
  })
})

describe('withBreaker — cooldown → half-open → closed', () => {
  test('durante o cooldown não chama fn; após o cooldown vira half-open e tenta de novo', async () => {
    const b = createBreaker()
    // Abre o breaker.
    for (let i = 0; i < config.chromaFailThreshold; i++) await withBreaker(b, fail, -1, 1000)
    expect(b.state).toBe('open')

    let calls = 0
    const fn = () => {
      calls += 1
      return Promise.resolve(42)
    }
    // Ainda no cooldown (now pouco depois de openedAt): fallback, fn não chamado.
    const during = await withBreaker(b, fn, -1, 1000 + config.chromaCooldownMs - 1)
    expect(during).toBe(-1)
    expect(calls).toBe(0)

    // Passado o cooldown: half-open tenta fn; sucesso fecha o breaker.
    const after = await withBreaker(b, fn, -1, 1000 + config.chromaCooldownMs + 1)
    expect(after).toBe(42)
    expect(calls).toBe(1)
    expect(b.state).toBe('closed')
  })

  test('sucesso em half-open volta para closed e zera failures', async () => {
    const b = createBreaker()
    for (let i = 0; i < config.chromaFailThreshold; i++) await withBreaker(b, fail, -1, 1000)
    expect(b.state).toBe('open')
    expect(b.failures).toBeGreaterThanOrEqual(config.chromaFailThreshold)

    const r = await withBreaker(b, ok(7), -1, 1000 + config.chromaCooldownMs + 1)
    expect(r).toBe(7)
    expect(b.state).toBe('closed')
    expect(b.failures).toBe(0)
  })

  test('falha em half-open reabre o breaker', async () => {
    const b = createBreaker()
    for (let i = 0; i < config.chromaFailThreshold; i++) await withBreaker(b, fail, -1, 1000)
    const reopenAt = 1000 + config.chromaCooldownMs + 1
    const r = await withBreaker(b, fail, -1, reopenAt)
    expect(r).toBe(-1)
    expect(b.state).toBe('open')
    expect(b.openedAt).toBe(reopenAt)
  })
})

describe('withTimeout — não pendura', () => {
  test('rejeita dentro de ~ms quando a promise nunca resolve', async () => {
    const never = new Promise<number>(() => {}) // nunca resolve
    const start = Date.now()
    await expect(withTimeout(never, 30)).rejects.toThrow(/timeout/)
    const elapsed = Date.now() - start
    expect(elapsed).toBeLessThan(500) // cortou rápido, não pendurou
  })

  test('resolve normalmente quando a promise é rápida', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 1000)).resolves.toBe('ok')
  })

  test('withBreaker trata o timeout como falha e devolve fallback (não lança)', async () => {
    const b = createBreaker()
    const hang = () => withTimeout(new Promise<number>(() => {}), 20)
    const r = await withBreaker(b, hang, -1, 1000)
    expect(r).toBe(-1)
    expect(b.failures).toBe(1)
  })
})

describe('warnOfflineDebounced — aviso debounced', () => {
  test('console.warn chamado no máximo 1x dentro da janela de debounce', () => {
    const b = createBreaker()
    const warnSpy = mock(() => {})
    const original = console.warn
    console.warn = warnSpy
    // Base > debounce para o 1º aviso emitir (lastWarnAt começa em 0).
    const t0 = config.chromaWarnDebounceMs + 5000
    try {
      // Várias chamadas dentro da mesma janela curta.
      warnOfflineDebounced(b, t0) // emite (t0 - 0 >= debounce)
      warnOfflineDebounced(b, t0) // mesmo instante → não emite
      warnOfflineDebounced(b, t0 + config.chromaWarnDebounceMs - 1) // ainda dentro da janela
      expect(warnSpy).toHaveBeenCalledTimes(1)

      // Passada a janela: emite de novo.
      warnOfflineDebounced(b, t0 + config.chromaWarnDebounceMs)
      expect(warnSpy).toHaveBeenCalledTimes(2)
    } finally {
      console.warn = original
    }
  })
})
