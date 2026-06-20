// src/skills/executor.ts
// ACT-03: timeout e watchdog de progresso
// ACT-04: ritmo humanizado via distribuição gaussiana (Box-Muller)

/**
 * Gera um delay humanizado usando distribuição gaussiana (Box-Muller transform).
 * Sem dependência externa — 4 linhas de implementação.
 *
 * @param meanMs - Valor médio do delay em ms
 * @param stdDevMs - Desvio padrão do delay em ms
 * @returns Delay em ms (sempre >= 0)
 */
export function gaussianDelay(meanMs: number, stdDevMs: number): number {
  let u = 0, v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  const normal = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v)
  return Math.max(0, Math.round(meanMs + normal * stdDevMs))
}

/** Função que retorna um número que muda enquanto há progresso */
export type ProgressChecker = () => number

export interface ExecuteOptions {
  /** Timeout máximo em ms. Após expirar, a skill falha com SkillTimeoutError. */
  timeoutMs?: number
  /** Função que retorna valor numérico — deve mudar para indicar progresso */
  progressChecker?: ProgressChecker
  /** Intervalo de polling do watchdog em ms (padrão: 2000) */
  progressIntervalMs?: number
  /** Tempo máximo sem progresso antes de abortar em ms (padrão: 10000) */
  noProgressToleranceMs?: number
  /** D-16: AbortSignal para preempção externa da skill (4° racer no race). */
  signal?: AbortSignal
}

/** Erro lançado quando skill excede o timeout (ACT-03) */
export class SkillTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Skill timeout após ${timeoutMs}ms`)
    this.name = 'SkillTimeoutError'
  }
}

/** Erro lançado quando watchdog detecta ausência de progresso (ACT-03) */
export class SkillStuckError extends Error {
  constructor(toleranceMs: number) {
    super(`Skill sem progresso por ${toleranceMs}ms (bot preso)`)
    this.name = 'SkillStuckError'
  }
}

/**
 * Executa uma skill async com:
 * - Delay humanizado pré/pós ação (ACT-04)
 * - Timeout via Promise.race (ACT-03)
 * - Watchdog de progresso via polling (ACT-03)
 *
 * NUNCA tranca o loop — todos os caminhos resolvem ou rejeitam a Promise.
 *
 * @param action - Skill async a executar
 * @param opts - Opções de timeout e watchdog
 * @returns Promise que resolve com resultado da skill ou rejeita com SkillTimeoutError/SkillStuckError
 */
export async function executeWithSafety<T>(
  action: () => Promise<T>,
  opts: ExecuteOptions = {}
): Promise<T> {
  const {
    timeoutMs = 30_000,
    progressChecker,
    progressIntervalMs = 2_000,
    noProgressToleranceMs = 10_000,
  } = opts

  // ACT-04: delay humanizado ANTES da ação (média 300ms, stddev 100ms)
  await new Promise<void>((r) => setTimeout(r, gaussianDelay(300, 100)))

  // ACT-03: timeout — rejeita após timeoutMs; timer armazenado para clearTimeout no finally
  let timeoutTimer: ReturnType<typeof setTimeout> | undefined
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutTimer = setTimeout(() => reject(new SkillTimeoutError(timeoutMs)), timeoutMs)
  })

  // ACT-03: watchdog de progresso — só criado quando progressChecker é fornecido (WR-02)
  let watchdogTimer: ReturnType<typeof setInterval> | undefined
  let watchdogPromise: Promise<never> | undefined
  if (progressChecker) {
    const checker = progressChecker
    watchdogPromise = new Promise<never>((_, reject) => {
      let lastValue = checker()
      let lastProgressAt = Date.now()

      watchdogTimer = setInterval(() => {
        const current = checker()
        if (current !== lastValue) {
          lastValue = current
          lastProgressAt = Date.now()
        } else if (Date.now() - lastProgressAt > noProgressToleranceMs) {
          reject(new SkillStuckError(noProgressToleranceMs))
        }
      }, progressIntervalMs)
    })
  }

  // D-16: AbortSignal como 4° racer — preempção externa da skill em curso
  let abortPromise: Promise<never> | undefined
  if (opts.signal) {
    const sig = opts.signal
    abortPromise = new Promise<never>((_, reject) => {
      if (sig.aborted) {
        reject(new Error('AbortError'))
        return
      }
      sig.addEventListener('abort', () => reject(new Error('AbortError')), { once: true })
    })
  }

  try {
    const racers: Promise<T | never>[] = [action(), timeoutPromise]
    if (watchdogPromise) racers.push(watchdogPromise)
    if (abortPromise) racers.push(abortPromise)    // D-16: 4° racer — preempção externa

    const result = await Promise.race(racers)

    // ACT-04: delay humanizado APÓS a ação (média 200ms, stddev 80ms)
    await new Promise<void>((r) => setTimeout(r, gaussianDelay(200, 80)))

    return result
  } finally {
    if (timeoutTimer !== undefined) clearTimeout(timeoutTimer)
    if (watchdogTimer !== undefined) clearInterval(watchdogTimer)
  }
}
