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
 */
export type TriggerEvent =
  | 'actionFinished'
  | 'nightFell'
  | 'dayBroke'
  | 'hostileNearby'
  | 'stuck'
  | 'hungry'

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

    bot.on('health', onHealth)
    bot.on('time', onTime)
    bot.on('entitySpawn', checkHostile)
    bot.on('entityMoved', checkHostile)

    // ── Cleanup ────────────────────────────────────────────────────────────────
    // Remove todos os listeners e cancela o debounce pendente (T-07.1-04).
    return () => {
      bot.off('health', onHealth)
      bot.off('time', onTime)
      bot.off('entitySpawn', checkHostile)
      bot.off('entityMoved', checkHostile)
      clearTimeout(this._hostileDebounce)
    }
  }
}
