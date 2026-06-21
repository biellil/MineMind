// src/skills/shelter.ts
// SURV-03 / D-08: skill reflexa `shelter` — abrigo de EMERGÊNCIA condicional dual:
//   • cavar-e-tampar  → quando há bloco sólido 2 abaixo e sem perigo (desce 1 e tampa o topo);
//   • pilar 1×1       → quando o terreno é plano/sem base (coloca bloco sob os pés e sobe).
//
// D-05 (Fase 9 / BUILD-01): placeBlock implementado UMA VEZ e compartilhado — o abrigo consome o
// wrapper robusto `placeBlockSafe`/`getRefAndFace` (src/skills/placeBlock.ts) em vez de chamar
// `bot.placeBlock` cru. Assim herda o swallow seletivo do timeout de blockUpdate (falso-negativo)
// e a verificação por blockAt, sem manter um placeBlock mínimo paralelo que diverge do robusto.
// Guarda anti-lava/caverna: checa blockAt 2 abaixo ANTES de cavar (não cair em lava nem em vazio).
//
// Fase 7 (D-08/D-12): SEMPRE resolve com SkillResult — nunca lança como fluxo. O outcome deriva
// da cobertura REAL observada após a ação (bloco 2 acima sólido = coberto), não da Promise.
import { z } from 'zod'
import type { Bot } from 'mineflayer'
import type { Vec3 } from 'vec3'
import type { SkillResult } from '../grounding/types'
import { placeBlockSafe, getRefAndFace } from './placeBlock'

/** Schema Zod do skill shelter (D-11). shelter não precisa de params além do signal de runtime. */
export const ShelterSchema = z.object({})

export type ShelterParams = z.infer<typeof ShelterSchema>

/** Nomes de blocos que NÃO são base sólida segura para cavar (cair) nem para o bot pisar. */
const UNSAFE_BELOW = new Set(['air', 'cave_air', 'void_air', 'lava', 'water'])

/** Regex de blocos sólidos comuns colocáveis em emergência (lista mínima — Fase 9 amplia). */
const PLACEABLE = /_(planks|log)$|^(cobblestone|stone|dirt|netherrack|deepslate)$/

/**
 * Cria um abrigo de emergência (reflexo de sobrevivência, SURV-03/D-08).
 *
 * @param bot - Instância do bot (precisa de inventory/blockAt/placeBlock/dig após spawn)
 * @param rawParams - Parâmetros não validados (só o signal de runtime importa)
 */
export async function shelter(bot: Bot, rawParams: unknown): Promise<SkillResult> {
  // Extrair signal ANTES do Zod (injeção de runtime — padrão navigate.ts/eat.ts).
  void ((rawParams as Record<string, unknown>)?.signal as AbortSignal | undefined)
  ShelterSchema.parse(rawParams ?? {})

  // Seleciona um bloco colocável do inventário (lista mínima de sólidos comuns).
  const block = bot.inventory.items().find((it) => PLACEABLE.test(it.name))
  if (!block) {
    return { outcome: 'no_effect', observed: 0, expected: 1, delta: {}, reason: 'sem blocos para abrigar' }
  }

  const pos = bot.entity.position
  const below2 = bot.blockAt(pos.offset(0, -2, 0))
  // canDig: precisa de base sólida 2 abaixo (não cair em caverna/lava/água) — guarda do D-08.
  const canDig = below2 != null && !UNSAFE_BELOW.has(below2.name)

  let threw: unknown = null
  // D-05: placeBlockSafe ENGOLE o throw do bot.placeBlock e devolve o motivo no SkillResult.reason.
  // Capturamos esse reason aqui para que o abrigo ainda exponha o diagnóstico da falha de colocação
  // (o `threw` local quase nunca dispara agora — o wrapper não relança).
  let placeReason: string | undefined

  if (canDig) {
    // Branch CAVAR-E-TAMPAR: cava o bloco 1 abaixo, desce e tampa o topo via wrapper robusto.
    try {
      const below1 = bot.blockAt(pos.offset(0, -1, 0))
      if (below1 && !UNSAFE_BELOW.has(below1.name)) {
        await bot.dig(below1)
      }
      // D-05: usa o wrapper robusto (swallow do timeout de blockUpdate + verificação por blockAt).
      // O alvo de cobertura é o topo (pos.offset(0,2,0) — onde o grounding checa `above`). Deixa o
      // getRefAndFace escolher o vizinho sólido + face; se null, segue ao grounding que decide partial.
      const topTarget = pos.offset(0, 2, 0)
      const rf = getRefAndFace(bot, { x: topTarget.x, y: topTarget.y, z: topTarget.z })
      if (rf) {
        const pr = await placeBlockSafe(bot, rf.ref, rf.face, block, {
          x: topTarget.x,
          y: topTarget.y,
          z: topTarget.z,
        })
        if (pr.outcome !== 'success') placeReason = pr.reason
      }
    } catch (err) {
      threw = err
    }
  } else {
    // Branch PILAR 1×1: equipa o bloco, pula e coloca sob os pés no ápice via wrapper robusto.
    try {
      await bot.equip(block, 'hand')
      await bot.lookAt(pos.offset(0, -1, 0))
      bot.setControlState('jump', true)
      // Pequena espera para chegar ao ápice antes de colocar o bloco sob os pés.
      await new Promise<void>((r) => setTimeout(r, 250))
      // alvo = sob os pés; ref = belowRef (o bloco abaixo), face para cima (D-05 reusa o wrapper —
      // placeBlockSafe re-equipa o bloco internamente, idempotente com o equip do pulo acima).
      const footTarget = pos.offset(0, -1, 0)
      const belowRef = bot.blockAt(footTarget)
      if (belowRef) {
        const pr = await placeBlockSafe(bot, belowRef, makeVec(0, 1, 0), block, {
          x: footTarget.x,
          y: footTarget.y,
          z: footTarget.z,
        })
        if (pr.outcome !== 'success') placeReason = pr.reason
      }
    } catch (err) {
      threw = err
    } finally {
      try {
        bot.setControlState('jump', false)
      } catch {
        /* ignora se o bot já não tem corpo */
      }
    }
  }

  // Grounding por cobertura REAL: há bloco sólido 2 acima = coberto (não pela Promise).
  const above = bot.blockAt(pos.offset(0, 2, 0))
  const covered = above != null && above.name !== 'air' && above.name !== 'cave_air'
  const outcome: SkillResult['outcome'] = covered ? 'success' : 'partial'
  const observed = covered ? 1 : 0
  // Reason: prioriza um throw local (raro — guarda do branch), senão o reason que placeBlockSafe
  // engoliu (D-05) — assim a falha de colocação continua diagnosticável mesmo sem o wrapper relançar.
  const reason = threw
    ? threw instanceof Error
      ? threw.message
      : String(threw)
    : placeReason

  return { outcome, observed, expected: 1, delta: {}, reason }
}

/**
 * Constrói um Vec3-like para o faceVector do placeBlock sem importar a classe Vec3 em runtime
 * (evita dependência de import direto; o offset já vem da posição do bot). Mineflayer aceita
 * objetos { x, y, z } como faceVector.
 */
function makeVec(x: number, y: number, z: number): Vec3 {
  return { x, y, z } as unknown as Vec3
}

/** Tool descriptor para LangGraph (D-11) */
export const shelterTool = {
  name: 'shelter',
  description: 'Cria abrigo de emergência (cavar-e-tampar ou pilar 1×1)',
  schema: ShelterSchema,
  execute: shelter,
} as const
