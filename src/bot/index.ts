// src/bot/index.ts
// Entry point do MineMind — inicia a conexão e o loop de vida do bot
import type { Bot } from 'mineflayer'
import { createBot } from './connection'
import { buildWorldSnapshot } from '../perception/snapshot'

/**
 * Callback chamado sempre que o bot está pronto (após spawn ou reconexão).
 * Na Fase 1: apenas demonstra a percepção capturando um snapshot inicial.
 * Na Fase 2: este callback será substituído pelo loop do StateGraph.
 */
function onBotReady(bot: Bot): void {
  // Demonstra PERC-01 a PERC-04: snapshot inicial após spawn
  // Pitfall 5: bot.inventory só está populado APÓS o spawn — ok aqui pois
  // onBotReady é chamado dentro do handler 'once spawn'
  const snapshot = buildWorldSnapshot(bot)

  console.log('[MineMind] Snapshot inicial capturado:')
  console.log(`  Status: HP ${snapshot.status.health} | Food ${snapshot.status.food} | Dia: ${snapshot.status.isDay}`)
  console.log(`  Entidades próximas: ${snapshot.entities.length}`)
  console.log(`  Jogadores próximos: ${snapshot.players.length}`)
  console.log(`  Tipos de bloco no raio: ${Object.keys(snapshot.nearbyBlockTypes).length}`)
  console.log(`  Inventário slots: ${snapshot.inventory.length}`)

  // Verificação de imutabilidade (D-10) — apenas em desenvolvimento
  if (process.env.NODE_ENV !== 'production') {
    try {
      ;(snapshot as unknown as Record<string, unknown>).capturedAt = 0
      console.warn('[MineMind] AVISO: snapshot NÃO é imutável! Verificar Object.freeze.')
    } catch {
      console.log('[MineMind] Snapshot imutável confirmado (Object.freeze funcionando).')
    }
  }

  // Demonstração de skills registradas (Fase 1 — loop cognitivo assume na Fase 2)
  import('../skills/index').then(({ skillRegistry }) => {
    console.log('[MineMind] Skills registradas:', Object.keys(skillRegistry).join(', '))
    console.log('[MineMind] Fase 1 completa — conexão, percepção e skills prontas.')
  })
}

// Iniciar o agente
console.log(`[MineMind] Iniciando... Conectando a ${process.env.MC_HOST ?? 'localhost'}:${process.env.MC_PORT ?? '25565'}`)
createBot(onBotReady)
