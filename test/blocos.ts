// test/blocos.ts
// Foco: BLOCOS EM VOLTA do bot (o "radar"). Mostra, pra cada tipo de bloco,
// a contagem + a posição/distância do mais próximo + até 3 exemplos de coordenada.
//
// Objetivo: ver O QUE O SNAPSHOT SABE sobre a localização dos blocos
// (coordenadas existem internamente, mas hoje NÃO são enviadas ao LLM — só "nome×contagem").
//
// Como rodar (com o servidor Minecraft no ar):
//   bun run test/blocos.ts

import mineflayer from 'mineflayer'

const HOST = process.env.MC_HOST || 'localhost'
const PORT = parseInt(process.env.MC_PORT || '25565', 10)
const USERNAME = process.env.MC_USERNAME || 'MineMindTest'
const VERSION = process.env.MC_VERSION || '1.21.4'
const RADIUS = parseInt(process.env.PERCEPTION_RADIUS || '32', 10)

console.log(`[test] Conectando em ${HOST}:${PORT} como "${USERNAME}" (MC ${VERSION})...`)

const bot = mineflayer.createBot({ host: HOST, port: PORT, username: USERNAME, version: VERSION, auth: 'offline' })

bot.on('error', (err) => console.error('[test] Erro:', err.message))
bot.on('kicked', (reason) => console.warn('[test] Kicked:', reason))
bot.on('end', (reason) => { console.log('[test] Desconectado:', reason); process.exit(0) })

bot.once('spawn', () => {
  console.log('[test] Spawnou! Aguardando dados de vida...')
  if (bot.health !== undefined) start()
  else bot.once('health', start)
})

function start(): void {
  console.log('[test] Pronto. Blocos em volta a cada 5s.\n')
  printBlocks()
  setInterval(printBlocks, 5000)
}

function printBlocks(): void {
  const pos = bot.entity.position

  // Acha blocos no raio (mesma chamada do snapshot do projeto)
  const positions = bot.findBlocks({
    maxDistance: RADIUS,
    count: 500,
    matching: (block) => block.type !== 0, // ignora ar
  })

  // Agrupa por tipo, guardando TODAS as posições + distância
  const byType = new Map<string, { x: number; y: number; z: number; dist: number }[]>()
  for (const bpos of positions) {
    const b = bot.blockAt(bpos)
    if (!b) continue
    const dist = pos.distanceTo(bpos)
    const arr = byType.get(b.name) ?? []
    arr.push({ x: bpos.x, y: bpos.y, z: bpos.z, dist })
    byType.set(b.name, arr)
  }

  // Ordena cada lista por distância (mais perto primeiro)
  for (const arr of byType.values()) arr.sort((a, b) => a.dist - b.dist)

  // Ordena os TIPOS pelo mais próximo de cada um
  const types = [...byType.entries()].sort((a, b) => a[1][0].dist - b[1][0].dist)

  console.log('═'.repeat(64))
  console.log(`⏱  ${new Date().toISOString()}  |  bot em (${pos.x.toFixed(0)},${pos.y.toFixed(0)},${pos.z.toFixed(0)})  |  raio ${RADIUS}`)
  console.log(`${'TIPO'.padEnd(20)} ${'QTD'.padStart(4)}  MAIS PRÓXIMO        DIST   (até 3 exemplos)`)
  console.log('─'.repeat(64))

  for (const [name, arr] of types) {
    const nearest = arr[0]
    const near = `(${nearest.x},${nearest.y},${nearest.z})`
    const examples = arr
      .slice(0, 3)
      .map((p) => `(${p.x},${p.y},${p.z})`)
      .join(' ')
    console.log(
      `${name.padEnd(20)} ${String(arr.length).padStart(4)}  ${near.padEnd(18)} ${nearest.dist.toFixed(1).padStart(5)}m  ${examples}`,
    )
  }

  console.log('═'.repeat(64) + '\n')
}
