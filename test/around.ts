// test/around.ts
// Teste simples e independente: conecta no servidor e mostra, a cada poucos segundos,
// O QUE VEM CRU DA API do Mineflayer — tudo que está "em volta" do bot.
//
// Não depende do código do src/ — é um espelho direto da API, só pra inspecionar.
//
// Como rodar (com o servidor Minecraft no ar):
//   bun run test/around.ts
//
// Variáveis de ambiente (mesmos defaults do projeto):
//   MC_HOST (localhost) | MC_PORT (25565) | MC_USERNAME (MineMindTest) | MC_VERSION (1.21.4)

import mineflayer from 'mineflayer'

const HOST = process.env.MC_HOST || 'localhost'
const PORT = parseInt(process.env.MC_PORT || '25565', 10)
const USERNAME = process.env.MC_USERNAME || 'MineMindTest'
const VERSION = process.env.MC_VERSION || '1.21.4'
const RADIUS = parseInt(process.env.PERCEPTION_RADIUS || '32', 10)

console.log(`[test] Conectando em ${HOST}:${PORT} como "${USERNAME}" (MC ${VERSION})...`)

const bot = mineflayer.createBot({
  host: HOST,
  port: PORT,
  username: USERNAME,
  version: VERSION,
  auth: 'offline',
})

bot.on('error', (err) => console.error('[test] Erro:', err.message))
bot.on('kicked', (reason) => console.warn('[test] Kicked:', reason))
bot.on('end', (reason) => {
  console.log('[test] Desconectado:', reason)
  process.exit(0)
})

bot.once('spawn', () => {
  console.log('[test] Spawnou! Aguardando dados de vida...')
  // Em 1.21.x vida/fome chegam num pacote separado após o spawn
  if (bot.health !== undefined) start()
  else bot.once('health', start)
})

function start(): void {
  console.log('[test] Pronto. Vou imprimir o que está em volta a cada 5s.\n')
  printAround()
  setInterval(printAround, 5000)
}

function printAround(): void {
  const pos = bot.entity.position

  console.log('═'.repeat(60))
  console.log(`⏱  ${new Date().toISOString()}`)

  // === 1. Status do próprio bot ===
  console.log('\n── STATUS DO BOT ──')
  console.log(`  vida:   ${bot.health}/20`)
  console.log(`  fome:   ${bot.food}/20`)
  console.log(`  pos:    (${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)})`)
  console.log(`  hora:   timeOfDay=${bot.time.timeOfDay} (${bot.time.timeOfDay < 13000 ? 'dia' : 'noite'})`)

  // === 2. Bloco na MIRA (o que ele está olhando) ===
  const cursor = bot.blockAtCursor(5)
  console.log('\n── NA MIRA (até 5m) ──')
  console.log(`  ${cursor ? `${cursor.name} a ${pos.distanceTo(cursor.position).toFixed(1)}m` : '(nada na mira)'}`)

  // === 3. Bloco SOB OS PÉS ===
  const below = bot.blockAt(pos.offset(0, -1, 0))
  console.log('\n── SOB OS PÉS ──')
  console.log(`  ${below?.name ?? 'unknown'}`)

  // === 4. Blocos EM VOLTA (radar) — agrupados por tipo ===
  const blockPositions = bot.findBlocks({
    maxDistance: RADIUS,
    count: 200,
    matching: (block) => block.type !== 0, // ignora ar
  })
  const byType = new Map<string, number>()
  for (const bpos of blockPositions) {
    const b = bot.blockAt(bpos)
    if (!b) continue
    byType.set(b.name, (byType.get(b.name) ?? 0) + 1)
  }
  const sorted = [...byType.entries()].sort((a, b) => b[1] - a[1])
  console.log(`\n── BLOCOS EM VOLTA (raio ${RADIUS}, top 200, por tipo) ──`)
  if (sorted.length === 0) console.log('  (nenhum)')
  for (const [name, count] of sorted.slice(0, 15)) {
    console.log(`  ${name.padEnd(22)} ×${count}`)
  }
  if (sorted.length > 15) console.log(`  ...e mais ${sorted.length - 15} tipos`)

  // === 5. Entidades/mobs EM VOLTA ===
  const entities = Object.values(bot.entities)
    .filter((e) => e !== bot.entity && e.position)
    .map((e) => ({
      name: (e as any).username ?? (e as any).name ?? e.type,
      type: e.type,
      kind: (e as any).kind ?? '?',
      dist: pos.distanceTo(e.position),
    }))
    .filter((e) => e.dist <= RADIUS)
    .sort((a, b) => a.dist - b.dist)
  console.log('\n── ENTIDADES EM VOLTA ──')
  if (entities.length === 0) console.log('  (nenhuma)')
  for (const e of entities.slice(0, 10)) {
    console.log(`  ${String(e.name).padEnd(18)} ${e.dist.toFixed(1).padStart(5)}m  [${e.type}/${e.kind}]`)
  }

  // === 6. Jogadores próximos ===
  const players = Object.values(bot.players).filter(
    (p) => p.username !== bot.username && p.entity != null,
  )
  console.log('\n── JOGADORES PRÓXIMOS ──')
  if (players.length === 0) console.log('  (nenhum)')
  for (const p of players) {
    const d = p.entity?.position ? pos.distanceTo(p.entity.position).toFixed(1) : '?'
    console.log(`  ${p.username.padEnd(18)} ${d}m`)
  }

  // === 7. Inventário ===
  const items = bot.inventory.items()
  console.log('\n── INVENTÁRIO ──')
  if (items.length === 0) console.log('  (vazio)')
  for (const it of items) {
    console.log(`  ${it.name.padEnd(22)} ×${it.count}`)
  }

  console.log('═'.repeat(60) + '\n')
}
