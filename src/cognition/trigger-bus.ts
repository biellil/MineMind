// src/cognition/trigger-bus.ts
// TriggerBus — sistema nervoso central da cadeia event-driven (Fase 07.1)
// Emite eventos semânticos derivados de eventos Mineflayer de baixo nível,
// permitindo que o driver faça Promise.race sobre gatilhos significativos.
//
// D-13: edge-detectors NUNCA assinam eventos de alta frequência sem limiar/debounce.
// D-14: 6 gatilhos semânticos — actionFinished/nightFell/dayBroke/hostileNearby/stuck/hungry.
// T-07.1-01/T-07.1-03: debounce e edge-detection protegem contra DoS por frequência.
// T-07.1-04: cleanup() remove todos os listeners para evitar vazamento.
import { EventEmitter } from 'node:events'
import type { Bot } from 'mineflayer'

/**
 * União de todos os gatilhos semânticos do TriggerBus.
 *
 * - actionFinished: emitido externamente pelo nó execute após skill terminar (Plan 3)
 * - nightFell / dayBroke: transição de dia/noite detectada via edge em bot.time
 * - hostileNearby: mob hostil detectado no raio configurado (debounced)
 * - stuck: emitido externamente pelo nó execute quando detecta ausência de progresso (Plan 3)
 * - hungry: transição de bot.food abaixo do limiar configurado
 *
 * Fase 8 (System 1 — gatilhos lifeCritical via physicsTick edge-detection, D-09/D-14):
 * - healthCritical: bot.health cruzou o limiar crítico para baixo (histerese enter/exit)
 * - drowning: bot.oxygenLevel cruzou o limiar de emersão para baixo (histerese enter/exit)
 * - lavaAhead: detectou lava no lookahead à frente (edge — só ao entrar no estado de perigo)
 * - fallAhead: detectou queda perigosa à frente (edge — só ao entrar no estado de perigo)
 */
export type TriggerEvent =
  | 'actionFinished'
  | 'nightFell'
  | 'dayBroke'
  | 'hostileNearby'
  | 'stuck'
  | 'hungry'
  | 'healthCritical'
  | 'drowning'
  | 'lavaAhead'
  | 'fallAhead'

/**
 * Parâmetros de configuração dos edge-detectors do TriggerBus.
 * Todos os campos têm default em config.ts — passar `config` diretamente é válido.
 */
export interface TriggerConfig {
  /** Distância em blocos para detectar mob hostil (default: config.hostileRadius) */
  hostileRadius: number
  /** Debounce em ms para hostileNearby — evita emissão a cada entityMoved (default: config.hostileDebounceMs) */
  hostileDebounceMs: number
  /** Food <= this → emite hungry (default: config.hungryThreshold) */
  hungryThreshold: number

  // === Fase 8: limiares dos gatilhos lifeCritical (physicsTick edge-detection, D-09/D-14) ===
  /** health <= this → emite healthCritical (default: config.healthCriticalThreshold) */
  healthCriticalThreshold: number
  /** health >= this → reseta o estado de borda de healthCritical (histerese, default: config.healthExitThreshold) */
  healthExitThreshold: number
  /** oxygen <= this → emite drowning (default: config.oxygenEmergeThreshold) */
  oxygenEmergeThreshold: number
  /** oxygen >= this → reseta o estado de borda de drowning (histerese, default: config.oxygenExitThreshold) */
  oxygenExitThreshold: number
  /** queda > this blocos de ar à frente → emite fallAhead (default: config.fallDangerBlocks) */
  fallDangerBlocks: number
  /** blocos à frente checados por lava no lookahead (default: config.lavaLookahead) */
  lavaLookahead: number
}

// ── Helpers de sensor ambiental (Fase 8 / D-09) ────────────────────────────────
// Baratos (1-2 blockAt por tick) e null-safe: bot.entity pode ser null na morte/void.
// O vetor de direção é derivado do yaw (Mineflayer: yaw=0 olha para -Z, cresce no sentido
// horário visto de cima). frente = (-sin(yaw), -cos(yaw)) no plano XZ.

/** True se há lava em algum bloco de 1..lookahead à frente do bot (nível dos pés e da cabeça). */
function isLavaAhead(bot: Bot, lookahead: number): boolean {
  if (!bot.entity) return false
  const pos = bot.entity.position
  const yaw = bot.entity.yaw ?? 0
  const dx = -Math.sin(yaw)
  const dz = -Math.cos(yaw)
  for (let d = 1; d <= lookahead; d++) {
    for (const dy of [0, 1]) {
      const p = pos.offset(dx * d, dy, dz * d)
      if (bot.blockAt(p)?.name === 'lava') return true
    }
  }
  return false
}

/** Conta blocos de 'air' abaixo da posição à frente do bot (cap ~6). 0 = chão sólido à frente. */
function fallDepthAhead(bot: Bot): number {
  if (!bot.entity) return 0
  const pos = bot.entity.position
  const yaw = bot.entity.yaw ?? 0
  const dx = -Math.sin(yaw)
  const dz = -Math.cos(yaw)
  const ahead = pos.offset(dx, 0, dz)
  let depth = 0
  for (let d = 1; d <= 6; d++) {
    const below = ahead.offset(0, -d, 0)
    const block = bot.blockAt(below)
    if (block && block.name !== 'air') break
    depth++
  }
  return depth
}

/**
 * TriggerBus — EventEmitter dedicado para gatilhos semânticos do loop agêntico.
 *
 * Uso:
 * ```ts
 * const bus = new TriggerBus()
 * const cleanup = bus.setupMineflayerListeners(bot, config)
 * bus.on('hostileNearby', () => { ... })
 * // ao encerrar:
 * cleanup()
 * ```
 *
 * actionFinished e stuck NÃO têm handlers internos — são emitidos pelo nó execute
 * diretamente via `bus.emit('actionFinished')` / `bus.emit('stuck')`.
 */
export class TriggerBus extends EventEmitter {
  /** Estado de borda para nightFell/dayBroke (true = era dia no tick anterior) */
  private _wasDay: boolean = true
  /** Último valor de food conhecido (para histerese do edge-detector hungry) */
  private _lastFood: number = 20
  /** Handle do debounce timer do hostileNearby (evita múltiplos emits por entityMoved) */
  private _hostileDebounce: ReturnType<typeof setTimeout> | undefined

  // === Fase 8: estado de borda dos gatilhos lifeCritical (histerese, D-09/D-14) ===
  /** true enquanto health está crítico (não re-emite até cruzar healthExitThreshold) */
  private _wasHealthCritical = false
  /** true enquanto oxygen está baixo (não re-emite até cruzar oxygenExitThreshold) */
  private _wasDrowning = false
  /** true enquanto há lava à frente (não re-emite até a lava sair do lookahead) */
  private _wasLavaAhead = false
  /** true enquanto há queda à frente (não re-emite até o chão voltar à frente) */
  private _wasFallAhead = false

  /**
   * Registra os listeners nos eventos Mineflayer relevantes e retorna uma função
   * de cleanup que remove TODOS os listeners registrados aqui.
   *
   * Deve ser chamado após bot.once('spawn') para que bot.food/bot.time estejam populados.
   * O retorno deve ser chamado em bot.once('end') ou ao destruir o agente (T-07.1-04).
   *
   * @param bot - Instância Mineflayer já conectada
   * @param cfg - Limiares de configuração (ver TriggerConfig)
   * @returns cleanup() — remove todos os listeners e cancela timers pendentes
   */
  setupMineflayerListeners(bot: Bot, cfg: TriggerConfig): () => void {
    // ── Edge-detector: hungry ──────────────────────────────────────────────────
    // Assina 'health' (dispara quando food muda) — NÃO 'physicsTick' (100Hz).
    // Histerese: só emite quando food CRUZA o limiar para baixo (não a cada tick abaixo).
    const onHealth = () => {
      if (bot.food <= cfg.hungryThreshold && this._lastFood > cfg.hungryThreshold) {
        this.emit('hungry', { food: bot.food })
      }
      this._lastFood = bot.food
    }

    // ── Edge-detector: nightFell / dayBroke ────────────────────────────────────
    // Assina 'time' (dispara a cada tick de tempo do servidor, ~20Hz).
    // Custo = 1 comparação booleana por tick. Nunca emite sem cruzar a borda.
    const onTime = () => {
      const isDay = bot.time.timeOfDay < 13000
      if (!isDay && this._wasDay) this.emit('nightFell')
      if (isDay && !this._wasDay) this.emit('dayBroke')
      this._wasDay = isDay
    }

    // ── Edge-detector: hostileNearby ───────────────────────────────────────────
    // Assina AMBOS entitySpawn (novo mob) e entityMoved (mob se aproximando).
    // NUNCA emite sem debounce — entityMoved dispara a ~20Hz (T-07.1-01 / D-13).
    // clearTimeout antes de setTimeout garante que só o último evento no burst conta.
    const checkHostile = () => {
      const botPos = bot.entity?.position
      if (!botPos) return
      const hasHostile = Object.values(bot.entities).some(
        (e) =>
          (e as unknown as Record<string, string>).kind === 'Hostile mobs' &&
          e.position.distanceTo(botPos) < cfg.hostileRadius,
      )
      if (hasHostile) {
        clearTimeout(this._hostileDebounce)
        this._hostileDebounce = setTimeout(
          () => this.emit('hostileNearby'),
          cfg.hostileDebounceMs,
        )
      }
    }

    // ── Edge-detector: gatilhos lifeCritical (Fase 8 / D-09) ───────────────────
    // Assina 'physicsTick' (alta frequência, ~20Hz). CRÍTICO (Pitfall 5): SÓ emite ao
    // CRUZAR a borda do estado de perigo — NUNCA a cada tick dentro do perigo. health e
    // oxygen usam histerese enter/exit (limiares separados); lava/queda são edge simples.
    // Todos os helpers ambientais são null-safe (bot.entity null na morte/void → false/0).
    const onPhysicsTick = () => {
      if (!bot.entity) return

      // health crítico — histerese (enter <= critical, exit >= exitThreshold)
      const healthCrit = bot.health <= cfg.healthCriticalThreshold
      if (healthCrit && !this._wasHealthCritical) this.emit('healthCritical', { health: bot.health })
      if (bot.health >= cfg.healthExitThreshold) this._wasHealthCritical = false
      else if (healthCrit) this._wasHealthCritical = true

      // afogamento — histerese (enter <= emerge, exit >= exitThreshold)
      const drown = bot.oxygenLevel <= cfg.oxygenEmergeThreshold
      if (drown && !this._wasDrowning) this.emit('drowning', { oxygen: bot.oxygenLevel })
      if (bot.oxygenLevel >= cfg.oxygenExitThreshold) this._wasDrowning = false
      else if (drown) this._wasDrowning = true

      // lava à frente (lookahead na direção da mira) — edge simples
      const lava = isLavaAhead(bot, cfg.lavaLookahead)
      if (lava && !this._wasLavaAhead) this.emit('lavaAhead')
      this._wasLavaAhead = lava

      // queda iminente (> fallDangerBlocks de ar abaixo à frente) — edge simples
      const fall = fallDepthAhead(bot) > cfg.fallDangerBlocks
      if (fall && !this._wasFallAhead) this.emit('fallAhead')
      this._wasFallAhead = fall
    }

    bot.on('health', onHealth)
    bot.on('time', onTime)
    bot.on('entitySpawn', checkHostile)
    bot.on('entityMoved', checkHostile)
    bot.on('physicsTick', onPhysicsTick)

    // ── Cleanup ────────────────────────────────────────────────────────────────
    // Remove todos os listeners e cancela o debounce pendente (T-07.1-04).
    return () => {
      bot.off('health', onHealth)
      bot.off('time', onTime)
      bot.off('entitySpawn', checkHostile)
      bot.off('entityMoved', checkHostile)
      bot.off('physicsTick', onPhysicsTick)
      clearTimeout(this._hostileDebounce)
    }
  }
}
