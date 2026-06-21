// src/skills/placeBlock.ts
// Fase 9 / D-01 (A+C) / BUILD-01: primitivo `placeBlock` ROBUSTO — implementado UMA vez e
// compartilhado por abrigo/building/estações (Planos 02/03/04 consomem).
//
// O grande problema do placeBlock do mineflayer é o FALSO-NEGATIVO: em servidor lagado o evento
// `blockUpdate` não chega dentro dos 5000ms internos e a Promise REJEITA — mesmo o bloco tendo
// sido colocado. A regra de ouro (GRND-01/D-01) é: a VERDADE é o mundo (`bot.blockAt(alvo)`),
// NUNCA a resolução da Promise. Por isso engolimos qualquer throw e derivamos o outcome do mundo.
//
// D-02: bot.placeBlock NÃO equipa o bloco sozinho — equipamos na mão antes.
// D-03: onceWithCleanup interno já remove o listener via .finally() — NÃO adicionar listeners manuais.
// D-04: o guarda de idempotência (alvo já preenchido) está aqui; o CORPO do retry fica RESERVADO
//       para fase futura (config.placeRetries default 0 — gap intencional e rastreável).
import { z } from 'zod'
import type { Bot } from 'mineflayer'
import type { Vec3 } from 'vec3'
import type { Block } from 'prismarine-block'
import type { Item } from 'prismarine-item'
import type { SkillResult } from '../grounding/types'
import { executeWithSafety } from './executor'
import { config } from '../config'

// Erros canônicos do mineflayer 4.37.1 (place_block.js + promise_utils.js — fonte verificada):
const FALSE_NEGATIVE = /did not fire within timeout/ // bloco PODE ter sido colocado (server lagado)
const GENUINE_FAIL = /No block has been placed/ //      bloco NÃO foi colocado (pós-check da lib)

// As 6 faces candidatas. O bloco a colocar aparece em ref.position + faceVector. Preferimos a face
// de BAIXO ([0,-1,0]) PRIMEIRO: o ref fica ACIMA do alvo e colocamos para baixo — caso de tampar
// o teto no abrigo cavar-e-tampar.
const FACES: ReadonlyArray<readonly [number, number, number]> = [
  [0, -1, 0],
  [0, 1, 0],
  [-1, 0, 0],
  [1, 0, 0],
  [0, 0, -1],
  [0, 0, 1],
]

/** Blocos que NÃO servem de referência sólida para encostar/colocar um bloco contra. */
const NON_SOLID = new Set(['air', 'cave_air', 'void_air', 'water', 'lava'])

/**
 * Constrói um Vec3-like sem importar a classe Vec3 em runtime (mineflayer aceita {x,y,z} como
 * faceVector — shelter.ts usa o mesmo truque).
 */
function makeVec(x: number, y: number, z: number): Vec3 {
  return { x, y, z } as unknown as Vec3
}

/** Verdade-do-mundo: a posição tem um bloco sólido (não-ar)? */
function isFilled(bot: Bot, pos: { x: number; y: number; z: number }): boolean {
  const b = bot.blockAt(pos as Parameters<typeof bot.blockAt>[0])
  return b != null && b.name !== 'air' && b.name !== 'cave_air'
}

/**
 * getRefAndFace (PURO, D-01 C): dado o alvo XYZ, escolhe um vizinho sólido contra o qual colocar
 * e devolve o faceVector correto. Para o alvo P, o ref candidato é `P + faceVector` (o vizinho) e a
 * face de colocação é `-faceVector` (aponta do ref ao alvo).
 *
 * Aceita o primeiro candidato em que: o ref é sólido E o alvo está livre (ar). Prefere a face de
 * baixo (ordem de FACES) para o caso tampar-teto. Retorna null se nada serve.
 *
 * @param bot    instância Mineflayer (usa só blockAt — testável com mock).
 * @param target posição absoluta onde colocar o bloco.
 */
export function getRefAndFace(
  bot: Bot,
  target: { x: number; y: number; z: number },
): { ref: Block; face: Vec3 } | null {
  // Se o alvo já está ocupado não há onde colocar (idempotência tratada acima, mas guardamos aqui também).
  if (isFilled(bot, target)) return null

  for (const fv of FACES) {
    const refPos = { x: target.x + fv[0], y: target.y + fv[1], z: target.z + fv[2] }
    const ref = bot.blockAt(refPos as Parameters<typeof bot.blockAt>[0])
    if (ref != null && !NON_SOLID.has(ref.name)) {
      // face de colocação = -faceVector (do ref para o alvo). `|| 0` normaliza o -0 do JS para 0.
      return { ref, face: makeVec(-fv[0] || 0, -fv[1] || 0, -fv[2] || 0) }
    }
  }
  return null
}

/**
 * placeBlockSafe (D-01 A): equipa o bloco, tenta colocar e DERIVA o outcome de `bot.blockAt(alvo)`.
 * Engole QUALQUER throw — o timeout do blockUpdate é falso-negativo em server lagado e nunca deve
 * virar falha (Pitfall 1). O GENUINE_FAIL ("No block has been placed") só decide partial-vs-no_effect
 * quando o mundo confirma que o alvo continua livre.
 *
 * @param bot        instância Mineflayer.
 * @param ref        bloco de referência (vizinho sólido) — vem do getRefAndFace.
 * @param faceVector face de colocação (aponta do ref ao alvo).
 * @param blockItem  item a equipar/colocar (D-02: placeBlock não equipa sozinho).
 * @param targetPos  posição absoluta do alvo — fonte da verdade pós-ação.
 */
export async function placeBlockSafe(
  bot: Bot,
  ref: Block,
  faceVector: Vec3,
  blockItem: Item,
  targetPos: { x: number; y: number; z: number },
): Promise<SkillResult> {
  await bot.equip(blockItem, 'hand') // D-02: placeBlock NÃO equipa sozinho

  let threw: unknown = null
  try {
    await bot.placeBlock(ref, faceVector)
  } catch (err) {
    // Swallow TOTAL (D-01/D-12): a verdade vem do mundo, não da Promise. Não propagamos nada.
    threw = err
  }

  // Pós-check (GRND-01/D-01): o mundo confirma — bloco sólido no alvo?
  const ok = isFilled(bot, targetPos)
  const msg = threw instanceof Error ? threw.message : threw ? String(threw) : undefined

  // Se foi falso-negativo (timeout) o bloco está lá → ok=true → 'success'. O GENUINE_FAIL só
  // diferencia partial (falha observada da lib) de no_effect (resolveu mas mundo intacto).
  const outcome: SkillResult['outcome'] = ok
    ? 'success'
    : threw && GENUINE_FAIL.test(msg ?? '')
      ? 'partial'
      : 'no_effect'

  return { outcome, observed: ok ? 1 : 0, expected: 1, delta: {}, reason: msg }
}

/** Schema Zod do skill placeBlock (D-11). */
export const PlaceBlockSchema = z.object({
  target: z
    .object({ x: z.number(), y: z.number(), z: z.number() })
    .describe('Posição absoluta onde colocar o bloco'),
  itemName: z.string().max(64).describe('Nome do bloco a colocar (ex: cobblestone)'),
})

export type PlaceBlockParams = z.infer<typeof PlaceBlockSchema>

/**
 * Skill de 1ª classe `placeBlock` — AUTO-EMBRULHA placeBlockSafe em executeWithSafety (padrão dig.ts:
 * timeout/abort/delay gaussiano). SEMPRE resolve com SkillResult (D-12: pré-condições viram no_effect,
 * nunca throw de fluxo).
 *
 * @param bot       instância Mineflayer.
 * @param rawParams params não validados (signal de runtime extraído antes do Zod).
 */
export async function placeBlock(bot: Bot, rawParams: unknown): Promise<SkillResult> {
  // Extrair signal ANTES do Zod (injeção de runtime — padrão dig.ts).
  const signal = (rawParams as Record<string, unknown>)?.signal as AbortSignal | undefined
  const { target, itemName } = PlaceBlockSchema.parse(rawParams)

  // Bloco precisa estar no inventário (D-02 equipa um Item concreto).
  const item = bot.inventory.items().find((i) => i.name === itemName)
  if (!item) {
    return { outcome: 'no_effect', observed: 0, expected: 1, delta: {}, reason: 'bloco ausente no inventário' }
  }

  // Idempotência (D-04): alvo já preenchido → success sem agir.
  if (isFilled(bot, target)) {
    return { outcome: 'success', observed: 1, expected: 1, delta: {}, reason: 'alvo já preenchido' }
  }

  // Escolha de ref+face (puro). Sem face exposta alcançável → no_effect.
  const rf = getRefAndFace(bot, target)
  if (!rf) {
    return { outcome: 'no_effect', observed: 0, expected: 1, delta: {}, reason: 'sem face exposta alcançável' }
  }

  // placeBlockSafe nunca lança — o executeWithSafety dá timeout/abort/delay gaussiano padrão.
  return await executeWithSafety(() => placeBlockSafe(bot, rf.ref, rf.face, item, target), {
    timeoutMs: config.placeTimeoutMs,
    signal,
  })
}

/** Tool descriptor para LangGraph (D-11). NÃO registrado no index.ts neste plano (Plano 03 registra). */
export const placeBlockTool = {
  name: 'placeBlock',
  description:
    'Coloca um bloco em uma posição XYZ de forma confiável (verificação por blockAt, trata timeout de servidor)',
  schema: PlaceBlockSchema,
  execute: placeBlock,
} as const
