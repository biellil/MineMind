// src/cognition/deliberation.ts
// COG-03 / D-19 / 10.1-02: deliberação LLM event-driven, FORA do grafo (Pattern 3).
//
// A camada reativa (grafo da Fase 2) roda no tick rápido e NUNCA espera o LLM. Esta deliberação
// "lenta" roda em paralelo: quando dispara, chama decideAction (Plan 01) com o arbiter como
// fallback (D-17) e escreve a decisão no holder. O nó analyze/decide lê a decisão PRONTA.
//
// Garantias (Pitfall 3 / T-03-09 + 10.1):
//  - gate por TIPO (D-01): nunca há duas inferências concorrentes do MESMO tipo (action/reflection).
//    Tipos distintos PODEM coexistir quando o semáforo tem permits (deixa de ser XOR — Pitfall 6).
//  - semáforo global (D-01/D-07): teto = provider.maxConcurrency; serializa quando permits=1 (D-03).
//  - commit síncrono merge-by-id (D-04/D-05): runReflection re-lê holder.goals no instante do write,
//    protegendo um goal de player empurrado durante o await (Pitfall 2).
//  - orçamento de replanejamento: respeita config.replanMinIntervalMs entre disparos de AÇÃO (D-19).
//  - reflexão nunca recebe signal (D-13): roda até o flush B2, nunca abortada pela preempção do player.
//  - release()/leave() SEMPRE no finally (Pitfall 3): sem permit/gate leak após throw/abort.
//  - ISTO NÃO É UM NÓ DO GRAFO — a inferência lenta jamais entra no tick rápido.
import { SystemMessage, HumanMessage, type BaseMessage } from '@langchain/core/messages'
import type { WorldSnapshot } from '../perception/types'
import type { CognitiveStateHolder } from './state'
import type { LlmProvider } from '../llm/provider'
import { decideAction } from '../llm/structured'
import { Semaphore, createTaskGate, type TaskType } from './concurrency'
import { buildPersonaPrompt, buildDecisionGuide, serializeContext } from '../llm/prompts'
import type { ActionDecision } from '../llm/schemas'
import { ReflectionOutputSchema, type ReflectionOutput } from '../llm/schemas'
import { arbitrate } from './arbiter'
import type { CognitiveState, ControlMode } from './types'
import { getEvents } from '../memory/shortTerm'
import { consolidate, applyGoalUpdates } from './reflection'
import { retrieve } from '../memory/longTerm'
import { nearbyPlacesString } from '../memory/places'
import { persistHolder } from '../memory/holder.persistence'
import type { ChromaMemoryClient } from '../memory/chromaClient'
import { config } from '../config'

/** Gatilhos de deliberação (D-19). `reflect` (REFL-01/D-12) reusa o single-flight existente. */
export type DeliberationTrigger = 'chat' | 'goal_changed' | 'need_threshold' | 'periodic' | 'reflect'

/** Hash estável e barato (djb2) — chaveia o cache do query embedding por texto do goal (D-11). */
export function hashString(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

/** Trunca p/ o log [recall] (slice local; não acopla ao helper não-exportado de prompts). */
function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max)}…`
}

/**
 * Computa (com cache D-11) o embedding da query de recuperação = embedding(currentGoal).
 *
 * O cache é chaveado pelo HASH do texto do goal: enquanto o goal não muda, NÃO re-embeda
 * (gasta ~1 embed por TROCA de goal, não por deliberação — invariante de custo). Goal null →
 * query embedding null (retrieve cai no fallback de recência). Degrada gracioso: falha de embed
 * → null (sem lançar). Exportado para teste.
 */
export async function computeGoalQueryEmbedding(
  holder: CognitiveStateHolder,
  provider: LlmProvider,
): Promise<number[] | null> {
  const goalText = holder.currentGoal ? JSON.stringify(holder.currentGoal) : ''
  const goalHash = hashString(goalText)
  if (holder.queryEmbeddingHash !== goalHash) {
    try {
      holder.queryEmbedding = goalText ? await provider.embed(goalText) : null
    } catch {
      holder.queryEmbedding = null // degrada: sem embedding → fallback de recência
    }
    holder.queryEmbeddingHash = goalHash
  }
  return holder.queryEmbedding
}

/**
 * Estado da deliberação (vive no closure do deliberator — testável/sem global).
 * 10.1-02 (D-01): o controle de sobreposição NÃO mora mais aqui (era o lock booleano único) —
 * agora é o `gate` por tipo + o `semaphore` global, injetados em maybeDeliberate. Resta só o
 * orçamento de replan de AÇÃO (`lastRunAt`).
 */
export interface DeliberationState {
  lastRunAt: number
}

/**
 * Decide se o gatilho deve disparar uma deliberação (event-driven, D-19):
 *  - chat: só em ASSISTANT (em AUTONOMOUS a conversa é mínima, D-07).
 *  - goal_changed / need_threshold: sempre relevantes.
 *  - periodic: rede de segurança (true), mas o teto de frequência (replanMinIntervalMs)
 *    é quem limita de fato no maybeDeliberate.
 */
export function shouldTrigger(trigger: DeliberationTrigger, holder: CognitiveStateHolder): boolean {
  switch (trigger) {
    case 'chat':
      return holder.disposition === 'ASSISTANT'
    case 'goal_changed':
    case 'need_threshold':
    case 'periodic':
      return true
    case 'reflect':
      // QUANDO refletir é decidido por shouldReflect no loop; aqui o gate por tipo só evita sobreposição
      // de duas reflexões simultâneas (D-01).
      return true
    default:
      return false
  }
}

/** Mapeia o CognitiveState do arbiter para uma ActionDecision do enum FECHADO. */
function cognitiveStateToAction(state: CognitiveState): ActionDecision['action'] {
  switch (state) {
    case 'gathering':
      return 'gather'
    case 'exploring':
      return 'explore'
    case 'socializing':
      return 'chat'
    case 'idle':
    case 'fighting': // stub → idle
    case 'building': // stub → idle
    default:
      return 'idle'
  }
}

/**
 * Materializa "o arbiter é o piso" (D-17): roda o arbiter determinístico e converte o
 * estado resultante numa ActionDecision do enum fechado, com reason marcando a origem.
 */
export function arbiterToDecision(snapshot: WorldSnapshot, mode: ControlMode): ActionDecision {
  const state = arbitrate(snapshot, mode, new Set())
  return { action: cognitiveStateToAction(state), reason: 'fallback:arbiter' }
}

/**
 * Tenta deliberar (gate por tipo + semáforo + orçamento de replan + event-driven). NÃO bloqueia o
 * tick: o chamador dispara com `void` e segue para o próximo tick (Pattern 3/Pitfall 3).
 *
 * Retorna `true` SOMENTE quando o trabalho de deliberação/reflexão de fato executou; `false`
 * quando faz no-op (gate ocupado pelo MESMO tipo, orçamento de replan, ou shouldTrigger=false).
 * O loop usa esse booleano para só rearmar o gatilho de reflexão quando a reflexão rodou (B1).
 *
 * 10.1-02 (D-01): o controle de sobreposição é POR TIPO — `gate.tryEnter(taskType)`. Tipos distintos
 * (ação vs reflexão) PODEM coexistir; só o MESMO tipo não sobrepõe (Pitfall 6). O `semaphore` impõe o
 * teto GLOBAL (= provider.maxConcurrency): com permits=1 serializa (D-03), com >=2 sobrepõe de verdade.
 *
 * D-12/D-13: `signal` é propagado SÓ ao caminho de AÇÃO (preempção do player). A REFLEXÃO NUNCA recebe
 * signal — roda até o flush B2, jamais abortada.
 *
 * D-19: o orçamento `replanMinIntervalMs` é o teto de REPLANEJAMENTO DE AÇÃO. A reflexão
 * (`trigger === 'reflect'`) tem cadência própria via shouldReflect no loop (D-10) e NÃO é
 * limitada por esse orçamento — evita que o budget de ação a deixe faminta (B1).
 *
 * INVARIANTE (Pitfall 3): `semaphore.release()` e `gate.leave()` SEMPRE no finally — mesmo em
 * throw/abort — senão o permit vaza e o semáforo seca (deadlock progressivo).
 */
export async function maybeDeliberate(
  state: DeliberationState,
  holder: CognitiveStateHolder,
  provider: LlmProvider,
  snapshot: WorldSnapshot,
  trigger: DeliberationTrigger,
  now: number,
  chroma: ChromaMemoryClient | null = null,
  gate: ReturnType<typeof createTaskGate> = createTaskGate(),
  semaphore: Semaphore = new Semaphore(1),
  signal?: AbortSignal,
): Promise<boolean> {
  // D-01: mapeia o trigger → TaskType. Prioridade: player(0) é roteado pelo loop, não aqui;
  // aqui só ação(1) e reflexão(2). Menor número = mais urgente (ação fura reflexão na fila).
  const taskType: TaskType = trigger === 'reflect' ? 'reflection' : 'action'
  const priority = trigger === 'reflect' ? 2 : 1

  // Gate por tipo (D-01/Pitfall 6): não sobrepõe o MESMO tipo; tipos distintos coexistem.
  if (!gate.tryEnter(taskType)) return false
  // D-19: orçamento de replan APENAS para o caminho de AÇÃO (a reflexão pula este gate — sua
  // cadência é governada por shouldReflect no loop, D-10). Libera o gate antes de sair.
  if (taskType === 'action' && now - state.lastRunAt < config.replanMinIntervalMs) {
    gate.leave(taskType)
    return false
  }
  if (!shouldTrigger(trigger, holder)) {
    gate.leave(taskType)
    return false // event-driven (D-19)
  }

  // Teto GLOBAL de concorrência (D-01/D-07): aguarda um slot do semáforo. A serialização emerge
  // quando permits=1 (D-03); com permits>=2 ação e reflexão coexistem de fato.
  await semaphore.acquire(priority)
  try {
    if (trigger === 'reflect') {
      // REFL-01/D-12/D-13: ramo de reflexão — NUNCA recebe signal (roda até o flush B2, não abortada).
      await runReflection(holder, provider, snapshot, now, chroma)
    } else {
      // D-11/D-12/D-13: recuperação de memórias no caminho de AÇÃO (correção central da fase).
      // query = embedding(currentGoal) CACHEADO por hash (~1 embed por troca de goal); top-k=3.
      const queryEmb = await computeGoalQueryEmbedding(holder, provider)
      const recalled = holder.db ? await retrieve(holder.db, chroma, queryEmb, now, { limit: 3 }) : []
      for (const r of recalled) {
        console.log(`[recall] #${r.id} score=${r.score.toFixed(2)} ${truncate(r.summary, 60)}`)
      }
      // D-16: memória espacial — "POIs próximos:" pela posição atual (top-3 por distância euclidiana).
      const pos = snapshot?.status?.position
      const poisLine = holder.db && pos ? nearbyPlacesString(holder.db, pos.x, pos.y, pos.z, 3) : ''
      // Caminho de AÇÃO existente. SOC-02/D-14: injeta a personalidade evolutiva no prompt.
      // LLM-02: guia de decisão (o que cada ação faz + anti-repetição) anexado à persona —
      // SÓ no caminho de ação (reflexão/chat não recebem). Sem isso o modelo só vê o enum cru.
      const messages: BaseMessage[] = [
        new SystemMessage(
          `${buildPersonaPrompt(holder.disposition, holder.personality)}\n\n${buildDecisionGuide()}`,
        ),
        new HumanMessage(
          serializeContext(
            snapshot,
            holder.needs,
            holder.currentGoal,
            getEvents(holder.memory),
            holder.lastObservedDelta, // D-09 A: fato autoritativo no caminho de AÇÃO
            recalled.map((r) => ({ id: r.id, summary: r.summary, score: r.score })), // D-12
            poisLine || undefined, // D-16: POIs próximos (memória espacial)
          ),
        ),
      ]
      // D-17: arbiter como fallback determinístico (decideAction nunca lança — Plan 01).
      // D-12: propaga o `signal` de preempção (o player aborta a AÇÃO em voo via AbortController do loop).
      const fallback = () => arbiterToDecision(snapshot, holder.control.getMode())
      const decision = await decideAction(provider, messages, fallback, { signal })
      holder.llmDecision = { decision, at: now }
      // Observabilidade do caminho de DECISÃO (vale p/ local e cloud — o cloud não loga no LM Studio).
      console.log(
        `[deliberate] action=${decision.action} target=${decision.target ?? '-'} reason=${decision.reason}`,
      )
    }
  } finally {
    // Pitfall 3 (D-02): release/leave SEMPRE — mesmo em throw/abort — ou o semáforo seca.
    semaphore.release()
    gate.leave(taskType)
    state.lastRunAt = now
  }
  return true // executou o trabalho de deliberação/reflexão (B1)
}

/**
 * Ramo de REFLEXÃO (REFL-01/D-12), executado sob o lock single-flight de maybeDeliberate.
 * NUNCA lança (try/catch interno) — degrada graciosamente para a consolidação determinística.
 *
 * Fluxo:
 *  1. (se LLM disponível) recupera memórias relevantes (D-08) e pede ao LLM um ReflectionOutput
 *     (resumo + deltas de objetivo), restrito por ReflectionOutputSchema;
 *  2. consolida SEMPRE CP→LP (D-13) — com ou sem LLM — gravando UM evento episódico em LP;
 *  3. aplica os deltas de objetivo (fallback no-op se vazio);
 *  4. faz flush da mente ao disco ao fim do ciclo de reflexão (D-02).
 */
export async function runReflection(
  holder: CognitiveStateHolder,
  provider: LlmProvider,
  snapshot: WorldSnapshot,
  now: number,
  chroma: ChromaMemoryClient | null = null,
): Promise<void> {
  const recent = getEvents(holder.memory)
  let summary: string | undefined
  let updates: ReflectionOutput['goalUpdates'] = []

  if (await provider.available()) {
    try {
      // Contexto recuperado (D-08): memórias relevantes ao colorir a reflexão (fallback sem embedding).
      const recalled = holder.db ? await retrieve(holder.db, chroma, null, now, { limit: 5 }) : []
      const messages: BaseMessage[] = [
        new SystemMessage(buildPersonaPrompt(holder.disposition, holder.personality)),
        new HumanMessage(
          'Reflita sobre os eventos recentes e atualize objetivos.\n' +
            serializeContext(snapshot, holder.needs, holder.currentGoal, recent) +
            (recalled.length
              ? `\nMemórias relevantes:\n${recalled.map((r) => r.summary).join('\n')}`
              : ''),
        ),
      ]
      const out = ReflectionOutputSchema.parse(await provider.decide(ReflectionOutputSchema, messages))
      summary = out.summary
      updates = out.goalUpdates
    } catch (e) {
      console.error(
        '[reflect] LLM inválido — consolidação determinística (no-op em goals):',
        e instanceof Error ? e.message : e,
      )
    }
  }

  // SEMPRE consolida CP→LP (D-13), com ou sem LLM:
  let emb: number[] | null = null
  if (holder.db && summary) {
    try {
      emb = await provider.embed(summary)
    } catch {
      emb = null
    }
  }
  // Warning 1: captura o id do evento consolidado para gravar o vetor no Chroma (D-07).
  const idConsolidado = holder.db ? consolidate(holder.db, recent, now, emb, summary) : null

  // D-07: o VETOR do evento consolidado vai para o ChromaDB (não mais para o vec0). addVector já
  // degrada gracioso (breaker) — se o Chroma estiver offline, o relacional segue intacto (D-01).
  if (chroma && emb && summary && idConsolidado != null) {
    await chroma.addVector({
      id: String(idConsolidado), // Open Question 2: String do lastInsertRowid consolidado
      embedding: emb, // 768-dim, sempre local
      metadata: { type: 'reflection', ts: now, importance: 8 },
      document: summary,
    })
    console.log(`[reflect] consolidado #${idConsolidado} (vetor enviado ao chroma se online)`)
  }

  // COMMIT SÍNCRONO MERGE-BY-ID (D-04/D-05/Pitfall 2): a partir daqui NÃO HÁ `await` até o
  // persistHolder. Todo o `await` longo (provider.decide/embed/chroma.addVector acima) já terminou
  // FORA do holder. A reatribuição RE-LÊ `holder.goals` NO INSTANTE do write — então um goal de
  // player empurrado (conversation.ts: holder.goals.push) DURANTE aquele await está presente no
  // array atual. applyGoalUpdates é merge-by-id: um goal sem id no `updates` cai no ramo "inalterado"
  // e SOBREVIVE (D-06 — goal de player nunca é clobberado; no pior caso perde-se um reprioritize).
  // No event loop single-thread, este bloco sem await é atômico por construção — nenhum push pode
  // intercalar entre este read e o persistHolder.
  holder.goals = applyGoalUpdates(holder.goals, updates, now)

  // Flush da mente ao fim do ciclo de reflexão (D-02) — ainda dentro do bloco síncrono do commit.
  if (holder.db) persistHolder(holder.db, holder, now)
}

/**
 * Cria um deliberator com estado (orçamento de replan) encapsulado no closure (testável, sem global).
 * Uma instância por sessão de loop é suficiente. O gate por tipo + semáforo são instanciados pelo
 * loop (1x por sessão, dimensionados por provider.maxConcurrency) e passados a maybeDeliberate.
 */
export function createDeliberator(): {
  state: DeliberationState
  maybeDeliberate: (
    state: DeliberationState,
    holder: CognitiveStateHolder,
    provider: LlmProvider,
    snapshot: WorldSnapshot,
    trigger: DeliberationTrigger,
    now: number,
    chroma?: ChromaMemoryClient | null,
    gate?: ReturnType<typeof createTaskGate>,
    semaphore?: Semaphore,
    signal?: AbortSignal,
  ) => Promise<boolean>
} {
  const state: DeliberationState = { lastRunAt: -Infinity }
  return { state, maybeDeliberate }
}
