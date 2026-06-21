// test/llm-context.ts
// Mostra EXATAMENTE o que o bot atual manda pro LLM — usando as funções REAIS do src/.
//
// Replica fielmente o que deliberation.ts monta no caminho de AÇÃO (deliberation.ts:124-137):
//   SystemMessage = buildPersonaPrompt(disposition, personality) + "\n\n" + buildDecisionGuide()
//   HumanMessage  = serializeContext(snapshot, needs, currentGoal, recentEvents, lastObservedDelta)
//
// Diferente de test/around.ts (que é a API crua enfeitada por mim), AQUI o texto é o
// produto do código de produção — é literalmente o que o modelo lê.
//
// Como rodar (com o servidor Minecraft no ar):
//   bun run test/llm-context.ts

import mineflayer from 'mineflayer'
import { pathfinder } from 'mineflayer-pathfinder'
import { buildWorldSnapshot } from '../src/perception/snapshot'
import { buildPersonaPrompt, buildDecisionGuide, serializeContext } from '../src/llm/prompts'
import { createNeeds } from '../src/motivation/needs'
import { config } from '../src/config'

const USERNAME = process.env.MC_USERNAME || 'MineMindTest'

console.log(`[test] Conectando em ${config.host}:${config.port} como "${USERNAME}" (MC ${config.mcVersion})...`)

const bot = mineflayer.createBot({
  host: config.host,
  port: config.port,
  username: USERNAME,
  version: config.mcVersion,
  auth: 'offline',
})

bot.on('error', (err) => console.error('[test] Erro:', err.message))
bot.on('kicked', (reason) => console.warn('[test] Kicked:', reason))
bot.on('end', (reason) => {
  console.log('[test] Desconectado:', reason)
  process.exit(0)
})

bot.once('spawn', () => {
  bot.loadPlugin(pathfinder) // findBlocks/blockAtCursor funcionam sem isso, mas o projeto carrega no spawn
  console.log('[test] Spawnou! Aguardando dados de vida...')
  if (bot.health !== undefined) start()
  else bot.once('health', start)
})

function start(): void {
  console.log('[test] Pronto. Vou imprimir o contexto do LLM a cada 5s.\n')
  printLlmContext()
  setInterval(printLlmContext, 5000)
}

/** Renderiza as necessidades de forma legível (só pra leitura humana neste teste). */
function renderNeeds(needs: ReturnType<typeof createNeeds>): string {
  return needs
    .map((n) => `${n.kind} ${Math.round(n.value * 100)}%`)
    .join(', ')
}

function printLlmContext(): void {
  const now = Date.now()

  // 1) Snapshot REAL (mesma função que o bot usa)
  const snapshot = buildWorldSnapshot(bot)

  // 2) Estado de motivação no boot (needs reais; goal ainda não selecionado).
  //    No bot rodando, needs evoluem e currentGoal é preenchido — aqui mostramos o ponto de partida.
  const needs = createNeeds(now)
  const currentGoal = null
  const recentEvents: never[] = [] // memória de curto prazo vazia no início
  const lastObservedDelta = null // nenhuma ação executada ainda

  // 3) Monta as DUAS mensagens EXATAMENTE como deliberation.ts faz (caminho de ação)
  const systemMessage =
    `${buildPersonaPrompt(config.dispositionDefault)}\n\n${buildDecisionGuide()}`
  const humanMessage = serializeContext(snapshot, needs, currentGoal, recentEvents, lastObservedDelta)

  console.log('█'.repeat(64))
  console.log(`⏱  ${new Date().toISOString()}`)
  console.log('\n┌─────────────── SYSTEM MESSAGE (persona + guia) ───────────────┐\n')
  console.log(systemMessage)
  console.log('\n┌─────────────── HUMAN MESSAGE (o que o LLM recebe HOJE) ───────┐\n')
  console.log(humanMessage)
  console.log('\n┌─────────────── VERSÃO LEGÍVEL (só pra você ler) ──────────────┐\n')
  console.log(`  Necessidades: ${renderNeeds(needs)}`)
  console.log(`  Objetivo atual: ${currentGoal ?? '(nenhum selecionado)'}`)
  console.log('\n' + '█'.repeat(64) + '\n')
}
