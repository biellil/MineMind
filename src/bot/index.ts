// src/bot/index.ts
// Entry point do MineMind — inicia a conexão e o loop cognitivo do bot
import type { Bot } from 'mineflayer'
import { createBot } from './connection'
import { startCognitiveLoop } from '../cognition/loop'

/**
 * Callback chamado sempre que o bot está pronto (após spawn ou reconexão).
 * Fase 2: inicia o loop cognitivo (StateGraph + driver externo single-flight).
 * Cada sessão chama isto 1x; a reconexão (connection.ts) inicia um loop fresco,
 * e o driver da sessão antiga termina via bot.once('end') (stop-on-disconnect).
 */
function onBotReady(bot: Bot): void {
  console.log('[MineMind] Bot pronto — iniciando loop cognitivo (Fase 2).')
  startCognitiveLoop(bot)
}

// Iniciar o agente
console.log(`[MineMind] Iniciando... Conectando a ${process.env.MC_HOST ?? 'localhost'}:${process.env.MC_PORT ?? '25565'}`)
createBot(onBotReady)
