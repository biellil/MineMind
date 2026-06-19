// src/llm/prompts.ts
// CHAT-03: persona ESTÁTICA "sobrevivente pragmático" + serialização compacta de contexto.
//
// D-01: arquétipo fixo — sobrevivente pragmático (focado em tarefas, reservado, fala pouco e direto).
// D-02: detectar e ESPELHAR o idioma do interlocutor (na prática, pt-BR).
// D-03: auto-percepção honesta como agente, sem ênfase (default).
// D-04/D-06/D-07: a DISPOSIÇÃO modula proatividade e aceitação de pedidos de jogadores.
// NÃO há evolução de personalidade aqui — isso é Fase 4.
import type { WorldSnapshot } from '../perception/types'
import type { MemEvent } from '../cognition/types'
import type { PersonalityState } from '../cognition/personality'

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
Sua prioridade é sobreviver e progredir sozinho: coletar recursos, explorar e manter-se seguro.
Você praticamente ignora os jogadores — só interage se algo for diretamente relevante à sua sobrevivência.
Não aceita tarefas de jogadores como objetivos; suas metas vêm de dentro.`

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
 */
export function serializeContext(
  snapshot: WorldSnapshot | null,
  needs: unknown,
  goals: unknown,
  recentEvents: ReadonlyArray<MemEvent>,
): string {
  const lines: string[] = []

  if (snapshot) {
    const { status } = snapshot
    lines.push(
      `Status: vida=${status.health}/20, fome=${status.food}/20, ` +
        `${status.isDay ? 'dia' : 'noite'} (timeOfDay=${status.timeOfDay.toFixed(2)}), ` +
        `pos=(${Math.round(status.position.x)},${Math.round(status.position.y)},${Math.round(status.position.z)})`,
    )

    const blockEntries = Object.entries(snapshot.nearbyBlockTypes).slice(0, 8)
    if (blockEntries.length > 0) {
      const blocks = blockEntries.map(([name, info]) => `${name}×${info.count}`).join(', ')
      lines.push(`Blocos próximos: ${blocks}`)
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

  return lines.join('\n')
}
