// src/perception/snapshot.ts
// PERC-01 a PERC-04: captura snapshot imutável do estado do mundo
// CHAMAR APENAS após bot.once('spawn') ter disparado (PITFALL 5)
import type { Bot } from 'mineflayer'
import type {
  WorldSnapshot,
  EntityInfo,
  PlayerInfo,
  InventorySlot,
  BlockSummary,
  Position3D,
} from './types'
import { config } from '../config'

/**
 * Itens dropados no chão são entidades genéricas (name === 'item'). Resolve o item real
 * (nome + quantidade) a partir do metadata, para o bot saber O QUE está caído no chão.
 * Retorna null quando a entidade não é um drop ou o item não pôde ser resolvido (fallback ao name genérico).
 */
function describeDroppedItem(
  bot: Bot,
  e: { name?: string; metadata?: unknown },
): string | null {
  if (e.name !== 'item') return null
  const meta = Array.isArray(e.metadata) ? e.metadata : []
  // O slot do item aparece no metadata como objeto com itemId (1.13+) ou blockId (legado).
  const slot = meta.find(
    (m: unknown) =>
      m != null &&
      (typeof (m as { itemId?: unknown }).itemId === 'number' ||
        typeof (m as { blockId?: unknown }).blockId === 'number'),
  ) as { itemId?: number; blockId?: number; itemCount?: number } | undefined
  if (!slot) return null
  const id = slot.itemId ?? slot.blockId
  const registry = (bot as unknown as { registry?: { items?: Record<number, { name?: string }> } }).registry
  const itemName = (id != null && registry?.items?.[id]?.name) || 'item'
  const count = slot.itemCount ?? 1
  return count > 1 ? `${itemName} x${count} (no chão)` : `${itemName} (no chão)`
}

/**
 * Captura um snapshot imutável do estado atual do mundo.
 * PERC-04: retorna um objeto plain sem nenhuma referência ao objeto bot.
 *
 * @param bot - Instância de bot Mineflayer (deve ter passado pelo evento 'spawn')
 * @returns WorldSnapshot imutável (structuredClone + Object.freeze), ou null se o bot não tem corpo.
 */
export function buildWorldSnapshot(bot: Bot): WorldSnapshot | null {
  // CR#1: na morte/queda no void o Mineflayer zera bot.entity. Sem corpo não há snapshot:
  // retornar null degrada o tick para idle (analyze já trata snapshot null) em vez de lançar
  // e derrubar o driver do loop.
  const entity = bot.entity
  if (!entity?.position) return null
  const pos = entity.position

  // === PERC-01: Status do próprio bot ===
  const status = {
    health: bot.health,
    food: bot.food,
    position: { x: pos.x, y: pos.y, z: pos.z } satisfies Position3D,
    timeOfDay: bot.time.timeOfDay,
    isDay: bot.time.timeOfDay < 13000,  // ticks 0–24000; dia = 0–13000
  }

  // === PERC-02: Entidades próximas (D-08: tipo, posição, distância, vida, metadata) ===
  const entities: EntityInfo[] = Object.values(bot.entities)
    .filter((e) => e !== bot.entity)  // excluir o próprio bot
    .map((e) => {
      const distance = pos.distanceTo(e.position)
      return {
        id: e.id,
        type: e.type,
        kind: (e as unknown as Record<string, string>).kind ?? 'UNKNOWN',
        name: (e as unknown as Record<string, string>).username ?? describeDroppedItem(bot, e) ?? (e as unknown as Record<string, string>).name ?? e.type,
        position: { x: e.position.x, y: e.position.y, z: e.position.z },
        distance,
        health: (e as unknown as Record<string, number | null>).health ?? null,
        metadata: (e as unknown as Record<string, unknown>).metadata ?? null,
      }
    })
    .filter((e) => e.distance <= config.perceptionRadius)
    .sort((a, b) => a.distance - b.distance)

  // === PERC-02: Jogadores próximos ===
  const players: PlayerInfo[] = Object.values(bot.players)
    .filter((p) => p.entity != null && p.username !== bot.username)
    .map((p) => {
      const entityPos = p.entity?.position
      const distance = entityPos ? pos.distanceTo(entityPos) : null
      return {
        username: p.username,
        displayName: p.displayName?.toString() ?? p.username,
        gamemode: p.gamemode,
        ping: p.ping,
        position: entityPos
          ? { x: entityPos.x, y: entityPos.y, z: entityPos.z }
          : null,
        distance,
      }
    })

  // === PERC-02: Tipos de bloco no raio (D-07: resumo por tipo, não serialização individual) ===
  // PITFALL 4: count: 200 limita a iteração; maxDistance usa o raio configurado
  const blockTypeMap = new Map<string, { count: number; examples: Position3D[] }>()

  const blockPositions = bot.findBlocks({
    maxDistance: config.perceptionRadius,
    count: 200,
    matching: (block) => block.type !== 0,  // excluir ar (type 0)
  })

  for (const bpos of blockPositions) {
    const block = bot.blockAt(bpos)
    if (!block) continue
    const name = block.name
    if (!blockTypeMap.has(name)) {
      blockTypeMap.set(name, { count: 0, examples: [] })
    }
    const entry = blockTypeMap.get(name)!
    entry.count++
    if (entry.examples.length < 3) {
      // Guardar até 3 exemplos de posição por tipo (D-07)
      entry.examples.push({ x: bpos.x, y: bpos.y, z: bpos.z })
    }
  }

  const nearbyBlockTypes: Record<string, BlockSummary> = Object.fromEntries(blockTypeMap)

  // === PERC-03: Inventário slot-a-slot (D-09) ===
  const inventory: InventorySlot[] = bot.inventory.items().map((item) => ({
    slot: item.slot,
    name: item.name,
    type: item.type,
    count: item.count,
    metadata: item.metadata,
    nbt: (item as unknown as Record<string, unknown>).nbt ?? null,
  }))

  // === Enriquecimento: bloco na mira (blockAtCursor pode retornar null) ===
  const cursorBlock = bot.blockAtCursor(5)
  const lookingAt = cursorBlock
    ? {
        name: cursorBlock.name,
        position: { x: cursorBlock.position.x, y: cursorBlock.position.y, z: cursorBlock.position.z },
        distance: pos.distanceTo(cursorBlock.position),
      }
    : null

  // === Enriquecimento: bloco sob os pés (blockAt pode retornar null) ===
  const belowBlock = bot.blockAt(pos.offset(0, -1, 0))
  const underfoot = belowBlock?.name ?? 'unknown'

  // === D-10: Montar snapshot e torná-lo imutável ===
  // structuredClone: cria cópia profunda sem NENHUMA referência ao objeto bot
  // Object.freeze: torna o objeto e seus filhos diretos somente-leitura em runtime
  const raw: WorldSnapshot = {
    capturedAt: Date.now(),
    status,
    entities,
    players,
    nearbyBlockTypes,
    inventory,
    lookingAt,
    underfoot,
  }

  // structuredClone garante cópia profunda (zero compartilhamento com bot)
  // Object.freeze garante erro ao tentar modificar (D-10)
  return Object.freeze(structuredClone(raw)) as WorldSnapshot
}
