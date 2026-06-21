// src/skills/station.ts
// Plan 09-03 / Task 1 / D-12/D-13/D-14: ensureStation — helper COMPARTILHADO por craft/smelt.
// Localiza (findBlock), navega adjacente (pathfinder, bounds 999.1) e, se não houver, POSICIONA a
// estação (fallback placeBlockSafe — deixa plantada, NÃO recolhe). Re-valida com findBlock e registra
// o POI 'station' best-effort.
//
// D-13 (comentário-chave): o POI 'station' é CACHE, não verdade — sempre re-validar com findBlock
// (passos 2/4) antes de confiar; a estação pode ter sido destruída. Por isso o registro do POI é
// best-effort (try/catch) e NUNCA bloqueia a estação.
import type { Bot } from 'mineflayer'
import type { Block } from 'prismarine-block'
import type { Database } from 'bun:sqlite'
import { goals } from 'mineflayer-pathfinder'
import { placeBlockSafe as realPlaceBlockSafe, getRefAndFace as realGetRefAndFace } from './placeBlock'
import { upsertPlace as realUpsertPlace } from '../memory/places'
import { config } from '../config'

/**
 * Seam de injeção dos colaboradores (D-01 testabilidade). Os defaults são os imports reais; os
 * testes sobrescrevem `__stationDeps` para observar/mockar SEM `mock.module` (que vaza global no bun
 * — convenção do projeto é injeção de dependência, ver deliberation.test.ts).
 */
export const __stationDeps = {
  placeBlockSafe: realPlaceBlockSafe as typeof realPlaceBlockSafe,
  getRefAndFace: realGetRefAndFace as typeof realGetRefAndFace,
  upsertPlace: realUpsertPlace as typeof realUpsertPlace,
}

/** Offsets candidatos para plantar a estação ADJACENTE ao bot (mesmo nível). */
const ADJACENT_OFFSETS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 0, 1],
  [0, 0, -1],
]

/**
 * Obtém o handle do DB durável best-effort a partir do bot (anexado em bot/index.ts via
 * bot.mineMindDb). O POI é cache (D-13) — se o handle não estiver disponível (testes, boot parcial),
 * degradamos silenciosamente sem bloquear a estação.
 */
function getDb(bot: Bot): Database | null {
  return ((bot as unknown as { mineMindDb?: Database }).mineMindDb) ?? null
}

/**
 * Garante uma estação de crafting/smelting alcançável (D-12).
 *
 * Fluxo:
 *   1. nome→id do BLOCO (Pitfall 5: registry, nunca type numérico mágico).
 *   2. findBlock no raio config.gatherSearchRadius (16).
 *   3. achou → navega adjacente (GoalNear range 2, bounds 999.1 herdados do setup do pathfinder).
 *   4. não achou → fallback: se há o item no inventário, planta adjacente via placeBlockSafe e
 *      re-valida com findBlock (raio 4). Sem item ou sem face livre → null.
 *   5. registra POI 'station' best-effort (D-13: cache, não verdade).
 *   6. retorna o Block confirmado (ou null).
 *
 * @param bot    instância Mineflayer.
 * @param type   'crafting_table' | 'furnace'.
 * @param signal AbortSignal opcional (preempção externa — honrado pelo pathfinder.stop em caso de abort).
 */
export async function ensureStation(
  bot: Bot,
  type: 'crafting_table' | 'furnace',
  signal?: AbortSignal,
): Promise<Block | null> {
  // (1) nome→id do BLOCO (Pitfall 5: NUNCA usar type numérico mágico).
  const id = bot.registry.blocksByName[type]?.id
  if (id === undefined) return null

  // Abort externo → para o pathfinder (não trava o loop).
  if (signal) {
    signal.addEventListener('abort', () => {
      try { bot.pathfinder.stop() } catch { /* pathfinder já parou */ }
    }, { once: true })
  }

  // (2) findBlock no raio de coleta (16).
  let block = bot.findBlock({ matching: id, maxDistance: config.gatherSearchRadius }) as Block | null

  if (block) {
    // (3) navega para ficar ADJACENTE (GoalNear range 2). Timeout/noPath: segue e re-valida.
    try {
      await bot.pathfinder.goto(new goals.GoalNear(block.position.x, block.position.y, block.position.z, 2))
    } catch {
      /* timeout/noPath: a estação ainda está lá; segue e re-valida com o findBlock que já temos */
    }
  } else {
    // (4) fallback (D-12 #3): planta a estação se há o item no inventário.
    const item = bot.inventory.items().find((i) => i.name === type)
    if (!item) return null // sem estação e sem como plantar

    // Escolhe um alvo livre adjacente ao bot (arredonda a posição).
    const px = Math.floor(bot.entity.position.x)
    const py = Math.floor(bot.entity.position.y)
    const pz = Math.floor(bot.entity.position.z)
    let placed = false
    for (const off of ADJACENT_OFFSETS) {
      const target = { x: px + off[0], y: py + off[1], z: pz + off[2] }
      const rf = __stationDeps.getRefAndFace(bot, target)
      if (rf) {
        // Deixa a estação plantada — NÃO recolher (D-12 #3).
        await __stationDeps.placeBlockSafe(bot, rf.ref, rf.face, item, target)
        placed = true
        break
      }
    }
    if (!placed) return null // nenhuma face livre adjacente

    // Re-valida (a estação é grounded): findBlock raio 4 após o place.
    block = bot.findBlock({ matching: id, maxDistance: 4 }) as Block | null
    if (!block) return null // placement não confirmou
  }

  // (5) registra POI 'station' best-effort (D-13: cache, não verdade — degrada se o db indisponível).
  try {
    const db = getDb(bot)
    if (db) {
      __stationDeps.upsertPlace(
        db,
        { x: block.position.x, y: block.position.y, z: block.position.z, type: 'station', label: type },
        Date.now(),
      )
    }
  } catch {
    /* POI é cache, não verdade — degradar sem bloquear a estação */
  }

  // (6) retorna a estação confirmada.
  return block
}
