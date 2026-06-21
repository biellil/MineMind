// src/skills/smelt.ts
// Plan 09-03 / Task 3 / CRAFT-03 / D-06..D-11/D-20: smelt funde 1 item por chamada (o loop CEDE
// entre itens — actionFinished re-percebe e a deliberação re-chama enquanto houver minério), com
// close() OBRIGATÓRIO no finally (Pitfall 3: fecha a window inclusive em erro/abort), e grounded
// pelo delta do item fundido (evaluateSmelt, D-20).
//
// Comentário-chave (D-06/D-11): "Funde 1 item, close(), cede (actionFinished re-percebe). ~10s
// não-preemptável DURANTE o item; preempção ENTRE itens. Lotes pequenos = escopo da fase."
//
// D-08: 1 WINDOW POR VEZ — close() é obrigatório. D-10: a verdade do produto é outputItem()/
// takeOutput(), NUNCA progress/fuel. Pitfall 5: nome→id via registry.itemsByName.
import { z } from 'zod'
import type { Bot } from 'mineflayer'
import type { SkillResult } from '../grounding/types'
import { captureGroundState } from '../grounding/capture'
import { evaluateSmelt } from '../grounding/evaluate'
import { ensureStation as realEnsureStation } from './station'
import { config } from '../config'

/**
 * Seam de injeção de ensureStation (testabilidade) — default é o import real. Os testes sobrescrevem
 * `__smeltDeps.ensureStation` SEM `mock.module` (que vaza global no bun; convenção é injeção).
 */
export const __smeltDeps = { ensureStation: realEnsureStation as typeof realEnsureStation }

/** Schema Zod do skill smelt (D-11). */
export const SmeltSchema = z.object({
  oreName: z.string().max(64).describe('Nome do minério/item a fundir (ex: iron_ore, raw_iron)'),
  count: z.number().int().min(1).max(64).default(1).describe('Quantidade total a fundir (funde 1 por chamada; loop cede entre itens)'),
})

export type SmeltParams = z.infer<typeof SmeltSchema>

/**
 * Densidade de combustível (itens fundidos por unidade, D-09). Preferir charcoal (renovável);
 * planks é descartável p/ 1-2 itens (Claude's discretion sobre a lista de planks).
 */
const FUEL_PER_UNIT: ReadonlyArray<readonly [string, number]> = [
  ['charcoal', 8],
  ['coal', 8],
  ['oak_planks', 1.5],
  ['birch_planks', 1.5],
]

/** Mapa mínimo minério→produto (fallback quando outputItem() não está disponível antes do take). */
const SMELT_PRODUCT: Record<string, string> = {
  iron_ore: 'iron_ingot',
  raw_iron: 'iron_ingot',
  gold_ore: 'gold_ingot',
  raw_gold: 'gold_ingot',
  copper_ore: 'copper_ingot',
  raw_copper: 'copper_ingot',
}

/** Escolhe o primeiro combustível presente no inventário (na ordem de FUEL_PER_UNIT). */
function pickFuel(bot: Bot): { name: string; perUnit: number } | null {
  const inv = bot.inventory.items()
  for (const [name, perUnit] of FUEL_PER_UNIT) {
    if (inv.some((i) => i.name === name)) return { name, perUnit }
  }
  return null
}

/**
 * Espera o output da fornalha (D-10): resolve quando outputItem() aparece (evento 'update'), com
 * timeout total e AbortSignal. NÃO acumula listeners (D-03): remove o listener no finally. A verdade
 * final é outputItem()/takeOutput(), NUNCA progress/fuel.
 */
function waitForOutput(furnace: any, opts: { timeoutMs: number; signal?: AbortSignal }): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    // já tem output? resolve imediato.
    if (furnace.outputItem()) {
      resolve()
      return
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    const onUpdate = () => {
      if (furnace.outputItem()) finish(resolve)
    }
    const onAbort = () => finish(() => reject(new Error('AbortError')))
    const cleanup = () => {
      if (timer !== undefined) clearTimeout(timer)
      furnace.removeListener('update', onUpdate)
      opts.signal?.removeEventListener('abort', onAbort)
    }
    const finish = (fn: () => void) => {
      cleanup()
      fn()
    }
    timer = setTimeout(() => finish(() => reject(new Error('SmeltTimeout'))), opts.timeoutMs)
    furnace.on('update', onUpdate)
    if (opts.signal) {
      if (opts.signal.aborted) { finish(() => reject(new Error('AbortError'))); return }
      opts.signal.addEventListener('abort', onAbort, { once: true })
    }
  })
}

/**
 * Funde 1 minério na fornalha (D-06: 1 item por chamada; o loop cede entre itens). Posiciona/localiza
 * a fornalha via ensureStation, abre a window (1 por vez), repõe combustível se preciso, funde,
 * recupera o resultado, e SEMPRE fecha a window (finally — Pitfall 3). Grounded por delta (D-20).
 *
 * @param bot       instância Mineflayer.
 * @param rawParams params não validados (signal de runtime extraído antes do Zod).
 */
export async function smelt(bot: Bot, rawParams: unknown): Promise<SkillResult> {
  // Extrair signal ANTES do Zod (injeção de runtime — padrão dig.ts).
  const signal = (rawParams as Record<string, unknown>)?.signal as AbortSignal | undefined
  const { oreName, count } = SmeltSchema.parse(rawParams)

  const before = captureGroundState(bot)

  // Localiza/posiciona a fornalha (D-12). Sem fornalha → no_effect ANTES de abrir window.
  const furnaceBlock = await __smeltDeps.ensureStation(bot, 'furnace', signal)
  if (!furnaceBlock) {
    return { outcome: 'no_effect', observed: 0, expected: count, delta: {}, reason: 'sem fornalha' }
  }

  // Pitfall 5: nome→id via registry.
  const oreId = bot.registry.itemsByName[oreName]?.id
  if (oreId === undefined) {
    return { outcome: 'no_effect', observed: 0, expected: count, delta: {}, reason: 'minério desconhecido no registry' }
  }

  const furnace = await bot.openFurnace(furnaceBlock) // D-08: 1 window por vez
  let threw: unknown = null
  let smeltedName: string | undefined

  try {
    // Combustível se preciso (D-09): sem fuel ativo e sem carga → repõe 1 unidade (1 item/chamada).
    const needsFuel = !furnace.fuelItem() && (furnace.fuel ?? 0) <= 0
    if (needsFuel) {
      const fuel = pickFuel(bot)
      if (fuel) {
        const fuelId = bot.registry.itemsByName[fuel.name]?.id
        if (fuelId !== undefined) {
          await furnace.putFuel(fuelId, null, Math.max(1, Math.ceil(1 / fuel.perUnit)))
        }
      }
    }

    await furnace.putInput(oreId, null, 1) // D-06: 1 item por chamada
    await waitForOutput(furnace, { timeoutMs: config.smeltUpdateTimeoutMs, signal }) // D-10
    smeltedName = furnace.outputItem()?.name // verdade do produto ANTES do take/close
    await furnace.takeOutput() // o Item retornado é a verdade; o delta confirma
  } catch (e) {
    threw = e
  } finally {
    try { furnace.close() } catch { /* close() SEMPRE, inclusive no abort (Pitfall 3) */ }
  }

  const after = captureGroundState(bot)
  // Nome do item fundido: outputItem capturado, senão fallback ao mapa mínimo, senão o próprio oreName.
  const mappedName = SMELT_PRODUCT[oreName] ?? oreName
  return evaluateSmelt(before, after, smeltedName ?? mappedName, 1, threw) // expected 1 por item (D-06)
}

/** Tool descriptor para LangGraph (D-11). Registrado no index.ts (Task 3). */
export const smeltTool = {
  name: 'smelt',
  description:
    'Funde 1 minério na fornalha (loop cede entre itens); escolhe combustível por densidade e recupera o resultado',
  schema: SmeltSchema,
  execute: smelt,
} as const
