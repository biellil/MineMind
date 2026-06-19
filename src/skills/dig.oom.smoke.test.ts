// src/skills/dig.oom.smoke.test.ts
// 999.1-05 / D-07: smoke headless multi-tick que prova o TRIPÉ de aceitação da fase
// (consistente com o estilo de loop.smoke.test.ts — bun:test, makeMockBot, SEM servidor MC):
//   1. SEM OOM     — gathering de alvo inalcançável completa sem matar o processo
//                    (process.memoryUsage().heapUsed cresce abaixo de um teto generoso).
//   2. REJEITA      — a skill rejeita (Error "Nenhuma instância alcançável" do pré-check,
//                    ou SkillTimeoutError do executeWithSafety) DENTRO de digTimeoutMs.
//   3. LAG < 200ms  — heartbeat (setInterval ~50ms) mede o drift do timer e acusa lag < 200ms
//                    durante toda a skill candidata a bloqueio. GATE PRINCIPAL da propriedade
//                    "o loop cognitivo nunca trava".
//
// PERCEPTION_RADIUS=32 é honrado (D-07). DIG_TIMEOUT_MS é reduzido para manter o smoke rápido
// sem afrouxar nenhuma asserção do tripé — ambos definidos ANTES do import de config/dig.

// --- D-07: honrar PERCEPTION_RADIUS=32 e manter o smoke rápido (env ANTES do import de config) ---
process.env.PERCEPTION_RADIUS = '32'
process.env.DIG_TIMEOUT_MS = '1500'

import { test, expect } from 'bun:test'
import { dig } from './dig'
import { config } from '../config'

interface MockBlock {
  name: string
  type: number
  position: { x: number; y: number; z: number }
}

/**
 * Heartbeat: setInterval ~50ms que mede o DRIFT do timer (lag do event loop).
 * Se a skill bloquear o loop sincronamente, o callback atrasa e maxLag dispara.
 */
function startHeartbeat() {
  let maxLag = 0
  let expected = Date.now() + 50
  const handle = setInterval(() => {
    const now = Date.now()
    const lag = now - expected
    if (lag > maxLag) maxLag = lag
    expected = now + 50
  }, 50)
  return {
    stop(): number {
      clearInterval(handle)
      return maxLag
    },
  }
}

/**
 * Bot mockado para o caminho string de dig() (D-07 — alvo INALCANÇÁVEL longe do bot).
 * getPathTo é SÍNCRONO e barato (não gera lag). collect simula o hang #222 (nunca resolve)
 * para que o teste FALHE explicitamente se o pré-check não filtrar os inalcançáveis.
 *
 * @param opts.status     status retornado por getPathTo para TODOS os candidatos
 * @param opts.collectHangs se true, collect retorna Promise que NUNCA resolve (#222)
 */
function makeMockBot(opts: { status: string; collectHangs: boolean }) {
  const collectCalls: MockBlock[][] = []
  // Alvos LONGE do bot (alvo inalcançável típico do cenário de OOM).
  const positions = [
    { x: 5000, y: 64, z: 5000 },
    { x: 5010, y: 64, z: 5010 },
    { x: 5020, y: 64, z: 5020 },
  ]

  const bot: any = {
    findBlocks: () => positions,
    blockAt: (pos: { x: number; y: number; z: number }) => ({
      name: 'oak_log',
      type: 17,
      position: pos,
    }),
    inventory: { items: () => [] },
    collectBlock: {
      movements: {},
      collect: (blocks: MockBlock[]) => {
        collectCalls.push(blocks)
        // #222: hang real — Promise que nunca resolve. A rede de segurança temporal
        // (executeWithSafety/digTimeoutMs) é quem DEVE matar isso.
        return opts.collectHangs ? new Promise<void>(() => {}) : Promise.resolve()
      },
    },
    pathfinder: {
      movements: {},
      // SÍNCRONO — não move o bot, não bloqueia o loop. Status fixo para todos.
      getPathTo: () => ({ status: opts.status }),
    },
  }
  return { bot, collectCalls }
}

// --- Teste A: alvo inalcançável -> rejeita + sem OOM + lag<200ms (TRIPÉ D-07) ---
test(
  'D-07 (A): alvo inalcançável rejeita dentro de digTimeoutMs, sem OOM e com lag<200ms',
  async () => {
    // Todos noPath => pré-check síncrono descarta tudo e dig lança ANTES de collect.
    const { bot, collectCalls } = makeMockBot({ status: 'noPath', collectHangs: true })

    const hb = startHeartbeat()
    const heapBefore = process.memoryUsage().heapUsed

    // [Ponto 2] a skill DEVE rejeitar (mensagem "Nenhuma instância alcançável").
    await expect(dig(bot, { target: 'oak_log', count: 1 })).rejects.toThrow(
      /Nenhuma instância alcançável/,
    )

    const maxLag = hb.stop()
    const heapAfter = process.memoryUsage().heapUsed

    // [Ponto 3 — GATE PRINCIPAL] event loop respondeu durante a skill.
    expect(maxLag).toBeLessThan(200)
    // [Ponto 1] sem crescimento explosivo de heap (teto generoso de 200MB; o A* sem bound
    // explodiria ~78GB — jamais respeitaria este teto).
    expect(heapAfter - heapBefore).toBeLessThan(200 * 1024 * 1024)
    // pré-check filtrou tudo => collect NUNCA foi chamado (não há hang a matar aqui).
    expect(collectCalls.length).toBe(0)
  },
  config.digTimeoutMs + 5000,
)

// --- Teste B: rede de segurança temporal quando collect "trava" (#222) ---
test(
  'D-07 (B): collect travado (#222) é morto por timeout dentro de digTimeoutMs, com lag<200ms',
  async () => {
    // Candidato "alcançável" (success) => dig chama collect, que TRAVA (#222).
    // executeWithSafety/digTimeoutMs é a rede de segurança que rejeita.
    const { bot, collectCalls } = makeMockBot({ status: 'success', collectHangs: true })

    const hb = startHeartbeat()

    // [Ponto 2] rejeita (SkillTimeoutError) sem travar o processo.
    await expect(dig(bot, { target: 'oak_log', count: 1 })).rejects.toThrow()

    const maxLag = hb.stop()

    // [Ponto 3 — GATE PRINCIPAL] o hang #222 NÃO bloqueou o event loop.
    expect(maxLag).toBeLessThan(200)
    // collect foi de fato chamado (provando que a rede temporal — não o pré-check — agiu).
    expect(collectCalls.length).toBe(1)
  },
  config.digTimeoutMs + 5000,
)
