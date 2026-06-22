// src/skills/builder.ts
// Plan 12-01 / Task 2 / D-01..D-05: builder GENÉRICO idempotente — o núcleo da Fase 12.
//
// Um skill-run itera um blueprint ORDENADO; cada bloco é um ponto de cedência (AbortSignal entre
// blocos). NÃO reimplementa equip/swallow do timeout — chama placeBlockSafe por bloco (já robusto,
// Fase 9). As três peças NOVAS estão aqui: ordenação determinística (D-05), retry idempotente
// (D-02, liga config.placeRetries), e a fachada `build` que monta a spec e roda o gerador.
//
// Grounding por COBERTURA real (D-03/D-10): o outcome deriva de contar quantas posições do blueprint
// estão isFilled DEPOIS do loop — NUNCA da resolução das Promises (verdade = bot.blockAt, Fase 7).
import { z } from 'zod'
import type { Bot } from 'mineflayer'
import type { Vec3 } from 'vec3'
import type { Item } from 'prismarine-item'
import type { SkillResult, SkillOutcome } from '../grounding/types'
import {
  placeBlockSafe as realPlaceBlockSafe,
  getRefAndFace as realGetRefAndFace,
  isFilled as realIsFilled,
} from './placeBlock'
import { ensureStation } from './station'
import { gaussianDelay, executeWithSafety } from './executor'
import { generateBlueprint, type BuildSpec, type BlueprintBlock } from './blueprints'
import { config } from '../config'

export type { BlueprintBlock } from './blueprints'

/**
 * Seam de injeção (espelha __stationDeps de station.ts:23). Os defaults são os imports reais; os
 * testes sobrescrevem para simular o mundo SEM mock.module (que vaza global no bun).
 */
export const __builderDeps = {
  placeBlockSafe: realPlaceBlockSafe as typeof realPlaceBlockSafe,
  getRefAndFace: realGetRefAndFace as typeof realGetRefAndFace,
  isFilled: realIsFilled as typeof realIsFilled,
}

/** Regex de blocos colocáveis (duplicada de shelter.ts:29 — D-04, evita acoplamento com a reflexa). */
const PLACEABLE = /_(planks|log)$|^(cobblestone|stone|dirt|netherrack|deepslate)$/

/** Descartáveis preferidos: gasta lixo antes de bloco útil ao construir (Claude's discretion). */
const DISPOSABLE = /^(cobblestone|dirt|cobbled_deepslate|netherrack)$/

/** Vec3-like sem importar a classe Vec3 em runtime (Pitfall 7 — mineflayer aceita {x,y,z}). */
function makeVec(x: number, y: number, z: number): Vec3 {
  return { x, y, z } as unknown as Vec3
}

/**
 * selectMaterial: resolve o Item concreto do inventário para um bloco-alvo. Prioridade:
 *   (a) item cujo nome === `bloco` (o que o blueprint pediu);
 *   (b) primeiro descartável (cobblestone/dirt/...);
 *   (c) qualquer item que case PLACEABLE.
 * Retorna null se nada serve (o builder pula o bloco — degrada, não lança).
 */
export function selectMaterial(bot: Bot, bloco: string): Item | null {
  const items = bot.inventory.items()
  return (
    items.find((i) => i.name === bloco) ??
    items.find((i) => DISPOSABLE.test(i.name)) ??
    items.find((i) => PLACEABLE.test(i.name)) ??
    null
  )
}

/**
 * orderForReach (D-05, RESEARCH Pattern 2): ordena os blocos para preservar reach e não auto-soterrar.
 * Critérios em cascata: célula do bot (pés `by` + cabeça `by+1`) por ÚLTIMO; depois y crescente
 * (baixo→cima); depois fora→dentro (maior distância horizontal ao centro do blueprint primeiro).
 */
export function orderForReach(blueprint: ReadonlyArray<BlueprintBlock>, bot: Bot): BlueprintBlock[] {
  const bx = Math.floor(bot.entity.position.x)
  const by = Math.floor(bot.entity.position.y)
  const bz = Math.floor(bot.entity.position.z)
  const isBotCell = (p: { x: number; y: number; z: number }) =>
    p.x === bx && (p.y === by || p.y === by + 1) && p.z === bz

  // Centro horizontal do blueprint (média) para o critério fora→dentro.
  let cx = 0
  let cz = 0
  for (const b of blueprint) {
    cx += b.pos.x
    cz += b.pos.z
  }
  const n = blueprint.length || 1
  cx /= n
  cz /= n
  const horizDist = (p: { x: number; z: number }) => (p.x - cx) ** 2 + (p.z - cz) ** 2

  return [...blueprint].sort((a, b) => {
    const aBot = isBotCell(a.pos)
    const bBot = isBotCell(b.pos)
    if (aBot !== bBot) return aBot ? 1 : -1 // célula do bot por ÚLTIMO
    if (a.pos.y !== b.pos.y) return a.pos.y - b.pos.y // baixo → cima
    return horizDist(b.pos) - horizDist(a.pos) // fora → dentro
  })
}

/**
 * placeOneWithRetry (D-02, RESEARCH Pattern 3): tenta colocar um bloco até config.placeRetries+1 vezes,
 * SEMPRE checando isFilled antes (o falso-negativo do blockUpdate é mais comum no building encadeado —
 * nunca recoloca). Re-resolve getRefAndFace a cada tentativa. Retorna a verdade-do-mundo final.
 */
async function placeOneWithRetry(
  bot: Bot,
  pos: { x: number; y: number; z: number },
  item: Item,
): Promise<boolean> {
  for (let attempt = 0; attempt <= config.placeRetries; attempt++) {
    if (__builderDeps.isFilled(bot, pos)) return true // race do blockUpdate → já lá
    const rf = __builderDeps.getRefAndFace(bot, pos)
    if (!rf) return false // sem face → pula (D-04, não throw)
    try {
      await bot.lookAt(makeVec(pos.x + 0.5, pos.y + 0.5, pos.z + 0.5))
    } catch {
      /* lookAt best-effort */
    }
    const r = await __builderDeps.placeBlockSafe(bot, rf.ref, rf.face, item, pos)
    if (r.outcome === 'success') return true
  }
  return __builderDeps.isFilled(bot, pos) // verdade-do-mundo final
}

/**
 * runBlueprint (D-01, RESEARCH Pattern 1): executa um blueprint ordenado bloco a bloco sobre
 * placeBlockSafe. Idempotente (pula preenchidos), preemptável (cede a abort ENTRE blocos), e
 * grounded por cobertura REAL (success só com cobertura total). NUNCA lança nem soterra (D-04).
 */
export async function runBlueprint(
  bot: Bot,
  blueprint: ReadonlyArray<BlueprintBlock>,
  signal?: AbortSignal,
): Promise<SkillResult> {
  const total = blueprint.length
  if (total === 0) return { outcome: 'no_effect', observed: 0, expected: 0, delta: {} }

  const ordered = orderForReach(blueprint, bot)
  for (const { pos, bloco } of ordered) {
    if (signal?.aborted) break // D-15: cede a lifeCritical ENTRE blocos
    if (__builderDeps.isFilled(bot, pos)) continue // D-03 idempotência
    const item = selectMaterial(bot, bloco)
    if (!item) continue // sem material → pula (degrada, não lança)
    await placeOneWithRetry(bot, pos, item) // D-02
    // D-01/D-16: pacing anti-cheat entre blocos (rajada é flagável).
    await new Promise<void>((r) =>
      setTimeout(r, gaussianDelay(config.buildBlockDelayMeanMs, config.buildBlockDelayStdMs)),
    )
  }

  // D-03/D-10: outcome por COBERTURA real (blockAt), nunca por Promise.
  const covered = blueprint.filter((b) => __builderDeps.isFilled(bot, b.pos)).length
  const outcome: SkillOutcome = covered >= total ? 'success' : covered > 0 ? 'partial' : 'no_effect'
  return { outcome, observed: covered, expected: total, delta: {} }
}

/** Schema Zod do skill `build` (D-11). dims/origin opcionais (resolução de defaults na skill). */
export const BuildSchema = z.object({
  tipo: z.enum(['shelter', 'wall', 'tower', 'station', 'custom']),
  dims: z.object({ w: z.number(), h: z.number(), d: z.number() }).optional(),
  origin: z.object({ x: z.number(), y: z.number(), z: z.number() }).optional(),
  bloco: z.string().max(64).optional(),
  // Caminho ad-hoc (D-08): lista crua de coords absolutas vinda do LLM para estruturas criativas.
  blocks: z
    .array(
      z.object({
        pos: z.object({ x: z.number(), y: z.number(), z: z.number() }),
        bloco: z.string(),
      }),
    )
    .optional(),
})

export type BuildParams = z.infer<typeof BuildSchema>

/** Dims default por estrutura (Open Question 3: dims default + origin = posição do bot). */
function defaultDims(tipo: 'shelter' | 'wall' | 'tower'): { w: number; h: number; d: number } {
  switch (tipo) {
    case 'shelter':
      return config.buildShelterDims
    case 'wall':
      return config.buildWallDims
    case 'tower':
      return config.buildTowerDims
  }
}

/**
 * Skill `build` (registrada pelo Plan 02). Resolve shelter/wall/tower (gerador determinístico),
 * station (reusa ensureStation da Fase 9) e custom (lista crua D-08). SEMPRE resolve com SkillResult
 * (D-12 — nunca lança como fluxo; try/catch degrada para error).
 */
export async function build(bot: Bot, rawParams: unknown): Promise<SkillResult> {
  // Extrair signal ANTES do Zod (injeção de runtime — padrão dig.ts/placeBlock.ts).
  const signal = (rawParams as Record<string, unknown>)?.signal as AbortSignal | undefined

  try {
    const params = BuildSchema.parse(rawParams)

    // station: reusa o helper provado da Fase 9 (NÃO usa runBlueprint).
    if (params.tipo === 'station') {
      const type = params.bloco === 'furnace' ? 'furnace' : 'crafting_table'
      const block = await ensureStation(bot, type, signal)
      return block != null
        ? { outcome: 'success', observed: 1, expected: 1, delta: {} }
        : { outcome: 'no_effect', observed: 0, expected: 1, delta: {}, reason: 'estação não confirmada' }
    }

    // Monta o blueprint conforme o tipo.
    let blueprint: BlueprintBlock[]
    if (params.tipo === 'custom') {
      blueprint = params.blocks ?? [] // D-08: coords absolutas cruas do LLM.
    } else {
      const p = bot.entity.position
      const origin = params.origin ?? { x: Math.floor(p.x), y: Math.floor(p.y), z: Math.floor(p.z) }
      const dims = params.dims ?? defaultDims(params.tipo)
      const spec: BuildSpec = { tipo: params.tipo, dims, origin, bloco: params.bloco }
      blueprint = generateBlueprint(spec)
    }

    // Embrulha em executeWithSafety para herdar timeout/abort/delay (D-16).
    return await executeWithSafety(() => runBlueprint(bot, blueprint, signal), {
      timeoutMs: config.buildTimeoutMs,
      signal,
    })
  } catch (err) {
    // D-12: NUNCA lança como fluxo — degrada para error com diagnóstico.
    const reason = err instanceof Error ? err.message : String(err)
    return { outcome: 'error', observed: 0, expected: 0, delta: {}, reason }
  }
}

/** Tool descriptor para LangGraph (D-11). NÃO registrado no index neste plano (Plan 02 registra). */
export const buildTool = {
  name: 'build',
  description:
    'Constrói uma estrutura determinística (shelter/wall/tower), uma estação (station) ou uma lista crua de blocos (custom)',
  schema: BuildSchema,
  execute: build,
} as const
