// src/memory/poi-detect.ts
// GAP-01 (08.1-07): fia DOIS tipos de POI de PROXIMIDADE que faltavam na memória espacial.
// Antes deste módulo, o único POI criado ao vivo era 'danger' (na morte, loop.ts:267) — o agente
// não sabia "o que tem onde". Aqui criamos:
//   - 'resource' quando uma coleta/mineração tem SUCESSO (outcome do SkillResult no nó execute);
//   - 'village'  quando o snapshot contém um aldeão (villager) percebido.
//
// Princípios:
//   - Compomos APENAS o helper existente `upsertPlace` (dedup por bucket espacial via ON CONFLICT,
//     try/catch interno → NUNCA lança). NÃO reimplementamos SQL nem criamos API nova de POI.
//   - Funções PURAS e testáveis (db + snapshot), degradam graciosamente com snapshot parcial.
//   - Só FATO VERIFICADO vira memória espacial de recurso (D-09 B): coleta sem sucesso NÃO cria POI.
//
// FORA DO ESCOPO (deliberado — NÃO inventar gatilhos artificiais):
//   - 'landmark'/'base': nenhum gatilho claro e barato existe hoje.
//   - Lições (lessons): deferidas para a Phase 14 (criação/leitura no prompt).
import type { Database } from 'bun:sqlite'
import type { WorldSnapshot } from '../perception/types'
import type { SkillOutcome } from '../grounding/types'
import { upsertPlace } from './places'

/**
 * Coleta/mineração com SUCESSO → POI 'resource' no local do recurso.
 * Posição: exemplo mais próximo do bloco coletado (snapshot) OU posição do bot como fallback.
 * Só em outcome 'success' (a guarda fica em um lugar só — seguro passar result.outcome direto).
 */
export function recordResourcePoi(
  db: Database,
  snap: WorldSnapshot,
  target: string,
  outcome: SkillOutcome,
  ts: number,
): void {
  if (outcome !== 'success') return
  const ex = target ? snap.nearbyBlockTypes?.[target]?.examples?.[0] : undefined
  const pos = ex ?? snap.status?.position
  if (!pos || typeof pos.x !== 'number') return // sem posição válida — degrada, não cria lixo
  upsertPlace(db, { x: pos.x, y: pos.y, z: pos.z, type: 'resource', notes: target || undefined }, ts)
}

/**
 * Aldeão percebido no snapshot → POI 'village' no local dele.
 * Detecção: name/type === 'villager' (mineflayer). EXCLUI 'zombie_villager' (hostil).
 * Dedup por bucket no upsertPlace evita flood (aldeão fica no snapshot por vários ticks).
 */
export function recordVillagePoi(db: Database, snap: WorldSnapshot, ts: number): void {
  const villager = snap.entities?.find((e) => e.name === 'villager' || e.type === 'villager')
  if (!villager) return
  const p = villager.position
  if (!p || typeof p.x !== 'number') return
  upsertPlace(db, { x: p.x, y: p.y, z: p.z, type: 'village', notes: 'villager' }, ts)
}
