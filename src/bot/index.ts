// src/bot/index.ts
// Entry point do MineMind — inicia a conexão e o loop cognitivo do bot
import type { Bot } from 'mineflayer'
import { createBot } from './connection'
import { startCognitiveLoop } from '../cognition/loop'
import { createCognitiveStateHolder } from '../cognition/state'

// Fase 3 (CONN-03/D-20): a "mente" (control/safety/memory/needs/goals/disposition/llmDecision)
// é criada UMA vez, ANTES de createBot, e reusada em cada sessão. Assim a reconexão NÃO reinicia
// a mente — o holder em-processo sobrevive ao bot.once('end')→nova sessão (Pitfall 2).
const holder = createCognitiveStateHolder()

/**
 * Callback chamado sempre que o bot está pronto (após spawn ou reconexão).
 * Fase 3: inicia o loop cognitivo (StateGraph + driver externo + deliberação LLM) injetando
 * o MESMO holder. Cada sessão chama isto 1x; a reconexão (connection.ts) inicia um loop fresco
 * com o holder durável, e o driver da sessão antiga termina via bot.once('end').
 */
function onBotReady(bot: Bot): void {
  console.log('[MineMind] Bot pronto — iniciando loop cognitivo (Fase 3).')
  startCognitiveLoop(bot, holder)
}

// Iniciar o agente
console.log(`[MineMind] Iniciando... Conectando a ${process.env.MC_HOST ?? 'localhost'}:${process.env.MC_PORT ?? '25565'}`)
createBot(onBotReady)
