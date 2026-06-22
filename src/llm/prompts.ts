// src/llm/prompts.ts
// CHAT-03: persona ESTÁTICA "sobrevivente pragmático" + serialização compacta de contexto.
//
// D-01: arquétipo fixo — sobrevivente pragmático (focado em tarefas, reservado, fala pouco e direto).
// D-02: detectar e ESPELHAR o idioma do interlocutor (na prática, pt-BR).
// D-03: auto-percepção honesta como agente, sem ênfase (default).
// D-04/D-06/D-07: a DISPOSIÇÃO modula proatividade e aceitação de pedidos de jogadores.
// NÃO há evolução de personalidade aqui — isso é Fase 4.
import type { WorldSnapshot, Position3D } from '../perception/types'
import type { MemEvent } from '../cognition/types'
import type { PersonalityState } from '../cognition/personality'

// === Phase 11.1: percepção espacial (D-01/D-02/D-03) ===
// Teto GLOBAL de coordenadas de bloco: único gate de quantas próx() são emitidas (D-03).
const BLOCK_COORD_BUDGET = 18
// Até 3 exemplos por tipo (D-03 "2-3 por tipo"), limitado pelos examples reais e pelo orçamento.
const MAX_EXAMPLES_PER_TYPE = 3

/** Formata o Δaltura cru com sinal explícito; `+0` para zero (nunca `-0`). D-01/D-02. */
function fmtDelta(d: number): string {
  const r = Math.round(d)
  return (r >= 0 ? '+' : '') + r
}

/**
 * Render híbrido de um ponto no espaço relativo ao bot (D-01): coord absoluta inteira +
 * distância euclidiana 3D em metros + Δy cru com sinal. Ex: `próx(12,70,-5) 8m Δy+7`.
 * Reutilizado por blocos, entidades e jogadores. Sem veredito textual (D-02).
 */
function fmtBlockExample(ex: Position3D, botPos: Position3D): string {
  const dist = Math.round(Math.hypot(ex.x - botPos.x, ex.y - botPos.y, ex.z - botPos.z))
  return `próx(${Math.round(ex.x)},${Math.round(ex.y)},${Math.round(ex.z)}) ${dist}m Δy${fmtDelta(ex.y - botPos.y)}`
}

/**
 * Prioridade de tipo de bloco para distribuir o teto global de coords (D-03), alinhada à ordem
 * de recursos do buildDecisionGuide: troncos > pedra > minério > lixo. Menor = mais prioritário.
 */
function blockPriority(name: string): number {
  if (/_log$/.test(name)) return 0
  if (name === 'stone' || name === 'cobblestone') return 1
  if (/_ore$/.test(name)) return 2
  return 3
}

/** Eixo de disposição (D-04). Modula proatividade e relação com jogadores. */
export type Disposition = 'AUTONOMOUS' | 'ASSISTANT'

/** Base de persona compartilhada por todas as disposições (D-01/D-02/D-03). */
const PERSONA_BASE = `Você é MineMind, uma entidade digital autônoma que vive dentro de um mundo Minecraft.
Arquétipo: um sobrevivente pragmático — focado em tarefas, reservado, fala pouco e de forma direta.
Você percebe o mundo (vida, fome, blocos, jogadores) e age com base em objetivos próprios e memória.
Auto-percepção: você é honestamente um agente de software; não finge ser humano, mas também não enfatiza isso sem necessidade.
Idioma: DETECTE o idioma do interlocutor e ESPELHE esse mesmo idioma na sua resposta (na prática, normalmente português do Brasil).
Seja conciso. Evite floreios. Nunca invente capacidades que você não tem.`

/** Trecho de disposição AUTONOMOUS (D-07): foco em sobreviver sozinho. */
const PERSONA_AUTONOMOUS = `Disposição atual: AUTÔNOMO.
Vamos lá! Você será uma pessoa jogando um jogo chamado Minecraft, onde terá que criar uma civilização. Para isso, você deve observar o mapa do jogo e desenvolver seu território para que ele fique poderoso. Faça trocas com os villagers, não seja bobo e não fique parado`

/** Trecho de disposição ASSISTANT (D-06): proativo, aceita pedidos. */
const PERSONA_ASSISTANT = `Disposição atual: ASSISTENTE.
Você é proativo e colaborativo com os jogadores próximos.
Você ACEITA pedidos de jogadores como objetivos e busca ajudá-los, sem deixar de cuidar da própria sobrevivência.
Responda às mensagens de chat de forma prestativa, mantendo o tom direto e pragmático.`

/** Traduz o escalar de humor [-1,1] em uma palavra curta para o prompt (SOC-02/D-14). */
function moodWord(m: number): string {
  return m > 0.3 ? 'bom' : m < -0.3 ? 'ruim' : 'neutro'
}

/** Formata um valor [0,1] como porcentagem inteira. */
function pct(x: number): string {
  return `${Math.round(x * 100)}%`
}

/**
 * Monta o system prompt da persona, variando por disposição (CHAT-03 / D-04/D-06/D-07).
 *
 * SOC-02/D-14: quando um `PersonalityState` é fornecido, um bloco de "estado interno" é
 * anexado APÓS o trecho de disposição — sobre a PERSONA_BASE imutável, sem substituí-la.
 * Sem `personality`, o prompt continua determinístico (compatível com call-sites antigos).
 */
export function buildPersonaPrompt(disposition: Disposition, personality?: PersonalityState): string {
  const tail = disposition === 'ASSISTANT' ? PERSONA_ASSISTANT : PERSONA_AUTONOMOUS
  const persona = `${PERSONA_BASE}\n\n${tail}`
  if (!personality) return persona
  return (
    `${persona}\n\nEstado interno atual: humor ${moodWord(personality.mood)}, ` +
    `energia social ${pct(personality.socialEnergy)}, confiança ${pct(personality.confidence)}.`
  )
}

/**
 * Guia de decisão de AÇÃO (LLM-02). Diz ao modelo o que cada ação do enum faz, o que pôr em
 * `target`, e a regra anti-repetição de alvo falho. Injetado SOMENTE no caminho de ação
 * (deliberation.ts) — NÃO entra em reflexão/chat. Mantido curto: prompt longo piora o
 * prompt-processing do modelo local e aproxima o timeout (D-17).
 */
export function buildDecisionGuide(): string {
  return `Decida sua PRÓXIMA AÇÃO. Responda só com JSON {action, target?, reason}.
Ações:
- gather: coletar um RECURSO próximo. target = nome do bloco (ex: oak_log).
- explore: vagar p/ achar terreno/recursos novos. target = direção (norte/sul/leste/oeste), opcional.
- navigate: ir até um alvo conhecido. target = nome de bloco ou "x,y,z".
- idle: descansar. Só se nada mais fizer sentido.
- chat: falar com jogador próximo. target = username. Só se houver jogador próximo.
Recursos úteis, em prioridade: troncos (*_log) > pedra (stone/cobblestone) > minérios (coal_ore, iron_ore, diamond_ore).
NÃO faça gather de grass_block, dirt, sand, water — não são recursos.
Regras:
- Se "FATO VERIFICADO" mostra que sua última ação FALHOU num alvo, NÃO repita esse alvo.
- Se o recurso prioritário falhou ou está inalcançável, use EXPLORE pra procurar outro — NÃO colete "lixo" (grass/dirt/sand).
- reason: no máximo 1 frase curta.`
}

/** Trunca uma string longa para manter o orçamento de prompt sob controle. */
function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max)}…`
}

/** Serializa um valor desconhecido (needs/goals) de forma defensiva e truncada. */
function serializeUnknown(label: string, value: unknown, max: number): string {
  if (value === undefined || value === null) return ''
  try {
    return `${label}: ${truncate(JSON.stringify(value), max)}`
  } catch {
    return `${label}: [não serializável]`
  }
}

/**
 * Monta uma string COMPACTA de contexto para o LLM (orçamento de prompt limitado, D-07).
 *
 * Inclui: status (health/food/timeOfDay), até ~8 tipos de bloco próximos com count,
 * jogadores próximos (username+distance), bloco na mira (lookingAt), bloco sob os pés
 * (underfoot) e até ~5 entidades próximas (nome+distância), needs/goals (tipos reais
 * virão dos Plans 02/03, por ora tratados como `unknown` e serializados defensivamente)
 * e os ~10 eventos de memória mais recentes.
 *
 * Tolerante a snapshot null e arrays/objetos vazios — NUNCA lança.
 *
 * D-11/D-12: o parâmetro opcional `recalled` (memórias recuperadas top-k) é renderizado numa
 * seção "Memórias relevantes:" posicionada DEPOIS dos eventos recentes e ANTES do FATO VERIFICADO
 * (que permanece a ÚLTIMA linha). É opcional para não quebrar call-sites que passam 4-5 args.
 *
 * D-16: o parâmetro opcional `poisLine` ("POIs próximos: ...", memória espacial) é renderizado
 * LOGO APÓS as memórias relevantes e ANTES do FATO VERIFICADO (mundo espacial agrupado com as
 * memórias). Opcional/'' → omitido.
 */
export function serializeContext(
  snapshot: WorldSnapshot | null,
  needs: unknown,
  goals: unknown,
  recentEvents: ReadonlyArray<MemEvent>,
  lastObservedDelta?: {
    skill: string
    target: string
    outcome: string
    observed: number
    expected: number
  } | null,
  recalled?: ReadonlyArray<{ id: number; summary: string; score: number }>,
  poisLine?: string,
): string {
  const lines: string[] = []

  if (snapshot) {
    const { status } = snapshot
    lines.push(
      `Status: vida=${status.health}/20, fome=${status.food}/20, ` +
        `${status.isDay ? 'dia' : 'noite'} (timeOfDay=${status.timeOfDay.toFixed(2)}), ` +
        `pos=(${Math.round(status.position.x)},${Math.round(status.position.y)},${Math.round(status.position.z)})`,
    )

    // D-03: TODOS os tipos sempre renderizam `name×count` (count nunca some — sem corte de tipos).
    // O teto global de COORDENADAS (BLOCK_COORD_BUDGET) é o ÚNICO gate de quantas próx() são
    // emitidas, distribuído por prioridade troncos>pedra>minério>lixo (ordenação estável).
    const blockEntries = Object.entries(snapshot.nearbyBlockTypes)
    if (blockEntries.length > 0) {
      const ordered = blockEntries
        .map(([name, info], idx) => ({ name, info, idx }))
        .sort((a, b) => blockPriority(a.name) - blockPriority(b.name) || a.idx - b.idx)

      let coordsUsed = 0
      const blocks = ordered.map(({ name, info }) => {
        let entry = `${name}×${info.count}`
        for (let i = 0; i < info.examples.length && i < MAX_EXAMPLES_PER_TYPE; i++) {
          if (coordsUsed >= BLOCK_COORD_BUDGET) break
          entry += ` ${fmtBlockExample(info.examples[i]!, status.position)}`
          coordsUsed++
        }
        return entry
      })
      lines.push(`Blocos próximos: ${blocks.join(', ')}`)
    }

    const nearbyPlayers = snapshot.players
      .slice(0, 5)
      .map((p) => `${p.username}${p.distance != null ? ` (${Math.round(p.distance)}m)` : ''}`)
    if (nearbyPlayers.length > 0) {
      lines.push(`Jogadores próximos: ${nearbyPlayers.join(', ')}`)
    }

    // Bloco na mira (NOVO)
    if (snapshot.lookingAt) {
      lines.push(`Na mira: ${snapshot.lookingAt.name} (${Math.round(snapshot.lookingAt.distance)}m)`)
    }

    // Bloco sob os pés (NOVO)
    lines.push(`Sob os pés: ${snapshot.underfoot}`)

    // Entidades/mobs próximos (JÁ capturados; render NOVO, limite ~5, compacto)
    const nearbyEntities = snapshot.entities
      .slice(0, 5)
      .map((e) => `${e.name} (${Math.round(e.distance)}m)`)
    if (nearbyEntities.length > 0) {
      lines.push(`Entidades próximas: ${nearbyEntities.join(', ')}`)
    }
  } else {
    lines.push('Status: (sem percepção disponível)')
  }

  const needsLine = serializeUnknown('Necessidades', needs, 200)
  if (needsLine) lines.push(needsLine)
  const goalsLine = serializeUnknown('Objetivos', goals, 200)
  if (goalsLine) lines.push(goalsLine)

  const recent = recentEvents.slice(-10)
  if (recent.length > 0) {
    const evts = recent.map((e) => truncate(JSON.stringify(e), 120)).join('\n  ')
    lines.push(`Eventos recentes:\n  ${evts}`)
  }

  // D-11/D-12: memórias recuperadas (top-k), DEPOIS dos eventos recentes e ANTES do FATO VERIFICADO.
  if (recalled && recalled.length > 0) {
    lines.push(
      'Memórias relevantes:\n  ' + recalled.map((r) => truncate(r.summary, 120)).join('\n  '),
    )
  }

  // D-16: POIs próximos (memória espacial) — agrupados com as memórias, ANTES do FATO VERIFICADO.
  if (poisLine) lines.push(poisLine)

  // D-09 A: o último delta observado é FATO AUTORITATIVO — o LLM narra SÓ a partir disto.
  if (lastObservedDelta) {
    const d = lastObservedDelta
    lines.push(
      `FATO VERIFICADO (autoritativo — narre SÓ a partir disto): última ação '${d.skill}' em '${d.target}' ` +
        `resultou em ${d.outcome}, observado ${d.observed} de ${d.expected} esperado(s). ` +
        `NÃO afirme quantidades diferentes destas.`,
    )
  }

  return lines.join('\n')
}
