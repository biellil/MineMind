// src/grounding/capture.ts
// Fase 7 D-04/D-05 — captura central do estado de chão (ground state) antes/depois de uma ação.
// Espelha o padrão imutável de buildWorldSnapshot (perception/snapshot.ts).
import type { Bot } from 'mineflayer'
import type { GroundState } from './types'

/**
 * Captura um GroundState imutável: inventário (total + por-item), posição e bloco no alvo XYZ.
 * @param bot   instância Mineflayer (após 'spawn').
 * @param targetPos posição XYZ opcional — quando a skill mira um bloco específico (dig em coordenada).
 */
export function captureGroundState(bot: Bot, targetPos?: { x: number; y: number; z: number }): GroundState {
  const items = bot.inventory.items()
  const inventoryCount = items.reduce((sum, it) => sum + it.count, 0)
  const itemsByName: Record<string, number> = {}
  for (const it of items) itemsByName[it.name] = (itemsByName[it.name] ?? 0) + it.count

  const p = bot.entity.position
  const position = { x: p.x, y: p.y, z: p.z }

  let targetBlockName: string | null = null
  if (targetPos) {
    const b = bot.blockAt({ x: targetPos.x, y: targetPos.y, z: targetPos.z } as Parameters<typeof bot.blockAt>[0])
    targetBlockName = b?.name ?? null
  }

  const raw: GroundState = { inventoryCount, itemsByName, position, targetBlockName, capturedAt: Date.now() }
  return Object.freeze(structuredClone(raw)) as GroundState
}

/** Helper puro: delta por-item entre dois GroundState (só chaves que mudaram). */
export function inventoryDelta(before: GroundState, after: GroundState): Record<string, number> {
  const delta: Record<string, number> = {}
  const names = new Set([...Object.keys(before.itemsByName), ...Object.keys(after.itemsByName)])
  for (const name of names) {
    const d = (after.itemsByName[name] ?? 0) - (before.itemsByName[name] ?? 0)
    if (d !== 0) delta[name] = d
  }
  return delta
}
