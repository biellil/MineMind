// src/control/commands.ts
// D-08/D-09: máquina de modo de controle + parser de comando literal de chat (SEM LLM).
// Segurança: lookup literal exato em um mapa imutável — nenhum eval, Function ou interpolação.
import type { Bot } from 'mineflayer'
import type { ControlMode, MemEvent } from '../cognition/types'

/** Mapa literal palavra-chave -> modo (D-09). Match EXATO após trim+lowercase. */
const COMMANDS: Readonly<Record<string, ControlMode>> = Object.freeze({
  '!pausar': 'paused',
  '!vem': 'standby',
  '!aqui': 'standby',
  '!livre': 'autonomous',
  '!auto': 'autonomous', // D-14: alias de controle de !livre (NÃO remove !livre — Fase 2 intacta)
})

/**
 * Mapeia uma mensagem de chat para um modo, ou null se não for comando reconhecido.
 * Match literal exato — segurança ASVS: nenhuma interpolação/eval, ignora entrada desconhecida.
 */
export function parseCommand(message: string): ControlMode | null {
  const key = message.trim().toLowerCase()
  return Object.prototype.hasOwnProperty.call(COMMANDS, key) ? COMMANDS[key]! : null
}

/** Estado de controle mutável que vive FORA do bot (lido pelo nó decide do grafo). */
export interface ControlState {
  getMode(): ControlMode
  setMode(mode: ControlMode): void
}

export function createControlState(initial: ControlMode = 'autonomous'): ControlState {
  let mode: ControlMode = initial
  return {
    getMode: () => mode,
    setMode: (m: ControlMode) => { mode = m },
  }
}

/**
 * Registra UM handler bot.on('chat') que aplica comandos literais ao ControlState.
 * Chamar dentro de onBotReady (1x por sessão — handler morre com a sessão, Pitfall 5).
 * onCommand (opcional): callback p/ gravar o comando na memória de curto prazo (D-12).
 */
export function registerChatCommands(
  bot: Bot,
  control: ControlState,
  onCommand?: (e: Extract<MemEvent, { type: 'chat_command' }>) => void,
): void {
  bot.on('chat', (username: string, message: string) => {
    if (username === bot.username) return            // Pitfall 5: ignora a si mesmo
    const mode = parseCommand(message)
    if (mode === null) return                        // no-op em entrada não reconhecida
    control.setMode(mode)
    onCommand?.({ type: 'chat_command', command: message.trim().toLowerCase(), from: username, mode, timestamp: Date.now() })
  })
}
