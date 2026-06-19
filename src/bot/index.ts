// src/bot/index.ts
// Entry point do MineMind — inicia a conexão e o loop cognitivo do bot
import type { Bot } from 'mineflayer'
import { createBot } from './connection'
import { startCognitiveLoop } from '../cognition/loop'
import { createCognitiveStateHolder } from '../cognition/state'
import { openDb } from '../memory/persistence'
import { hydrateHolder, persistHolder } from '../memory/holder.persistence'

// Fase 3 (CONN-03/D-20): a "mente" (control/safety/memory/needs/goals/disposition/llmDecision)
// é criada UMA vez, ANTES de createBot, e reusada em cada sessão. Assim a reconexão NÃO reinicia
// a mente — o holder em-processo sobrevive ao bot.once('end')→nova sessão (Pitfall 2).
const holder = createCognitiveStateHolder()

// Fase 4 (D-04): abrir o DB durável e hidratar a mente do disco 1x no boot. A partir daqui o
// holder carrega o handle (holder.db) para os consumidores do Plan 07 (flush por reflexão).
const db = openDb()
holder.db = db
hydrateHolder(db, holder, Date.now())
console.log('[MineMind] Mente hidratada do disco (Fase 4).')

/**
 * Shutdown gracioso (D-02 / Pitfall 5): persiste o estado vivo e fecha o DB — db.close() faz o
 * WAL checkpoint, garantindo que o snapshot foi materializado no arquivo principal antes de sair.
 */
function shutdown(signal: string): void {
  console.log(`[MineMind] ${signal} — persistindo a mente e fechando o DB...`)
  try {
    persistHolder(db, holder, Date.now())
  } catch (e) {
    console.error('[shutdown] persistHolder falhou:', e)
  }
  try {
    db.close()
  } catch (e) {
    console.error('[shutdown] db.close falhou:', e)
  }
  process.exit(0)
}
process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

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
