// src/cognition/nodes.ts
// Nós do StateGraph. Fase 2: bot/control/safety por closure (Pitfall 3), sem LLM no tick.
// Fase 3 (CONN-03/D-20): control/safety/memory vêm do holder (fonte única). observe roda a
// motivação (evaluateNeeds/generateGoals/selectGoal) com pesos POR DISPOSIÇÃO (motivationConfigFor,
// D-06/D-10). analyze prefere a decisão LLM FRESCA do holder; senão degrada ao arbiter (D-17).
import type { Bot } from 'mineflayer'
import type { WorldSnapshot } from '../perception/types'
import { buildWorldSnapshot } from '../perception/snapshot'
import { skillRegistry } from '../skills/index'
import { config, motivationConfigFor } from '../config'
import type { CognitiveState } from './types'
import type { ShortTermMemory } from '../memory/shortTerm'
import { recordEvent } from '../memory/recordEvent'
import { recordResourcePoi, recordVillagePoi } from '../memory/poi-detect'
import type { CognitiveStateHolder } from './state'
import type { LlmProvider } from '../llm/provider'
import type { ActionDecision } from '../llm/schemas'
import type { Disposition, Goal, Need } from '../motivation/types'
import { evaluateNeeds, urgency } from '../motivation/needs'
import { generateGoals, selectGoal, advanceProgress } from '../motivation/goals'
import { arbitrate, highestPriorityGatherTarget } from './arbiter'
import {
  recordAttempt,
  shouldAbandon,
  recordFailure,
  recordSuccess,
  shouldFallbackToIdle,
  decayBackoff,
  cooledDownTargets,
} from './safety'

/** Estado anotado do loop. Carrega apenas dados puros — NUNCA o bot. */
export interface LoopState {
  snapshot: WorldSnapshot | null
  cogState: CognitiveState
  memory: ShortTermMemory
  needs: Need[]
  goals: Goal[]
  currentGoal: Goal | null
  disposition: Disposition
  // Fase 07.1 Plan 03: sinais para o driver event-driven (D-10/D-11)
  enteredIdle: boolean
  nextWakeMs: number
}

export interface NodeDeps {
  bot: Bot
  holder: CognitiveStateHolder
  provider: LlmProvider
  triggerBus: import('./trigger-bus').TriggerBus  // Fase 07.1 Plan 03 — emit('actionFinished')
}

const now = () => Date.now()
const log = (msg: string) => console.log(`[loop] ${msg}`)

// Fase 8 (D-02/Pattern 2): TODOS os gatilhos lifeCritical preemptam a skill em curso.
// O nó execute registra um listener por gatilho; cada um força setGoal(null) (D-07) ANTES do abort.
const LIFE_CRITICAL_TRIGGERS = ['hostileNearby', 'healthCritical', 'drowning', 'lavaAhead', 'fallAhead'] as const

// Fase 10 D-09/D-10: prefixos de sub-goals do DAG tech-tree.
// Constante de módulo reutilizada em observe (ponte need→DAG) e execute (roteador + D-03).
const DAG_PREFIXES = ['gather:', 'craft:', 'smelt:', 'ensure:'] as const

/** Mapeia a ação do enum LLM (fechado) para um CognitiveState da Fase 2. */
function actionToCognitiveState(action: ActionDecision['action']): CognitiveState {
  switch (action) {
    case 'gather':
      return 'gathering'
    case 'explore':
    case 'navigate':
      return 'exploring'
    case 'chat':
      return 'socializing'
    // G-01: craft/smelt/equip/place agregam no estado 'building' (ações de construção/produção).
    // O verbo exato é re-resolvido no execute a partir de fresh.decision.action — manter 'building'
    // agregado mantém a Phase 10 livre para refinar a granularidade de estado sem mexer aqui.
    case 'craft':
    case 'smelt':
    case 'equip':
    case 'place':
      return 'building'
    case 'idle':
    default:
      return 'idle'
  }
}

/**
 * D-09/D-10 Fase 10: Mapeia ID de sub-goal do DAG para (skill, params) sem LLM.
 * 'gather:X' → dig(X,1); 'craft:X' → craft(X,1); 'smelt:X' → smelt(X,1); 'ensure:X' → null (no-op).
 * Pitfall 5: iron_ingot como intermediário — 'smelt:iron_ore' roteia para smelt com oreName='iron_ore'.
 *
 * Retorna null quando o prefixo é 'ensure:*' (ensureStation é chamado internamente por craft/smelt)
 * ou quando o goalId não tem prefixo DAG reconhecido.
 */
export function goalToSkillParams(goalId: string): { skill: string; paramsJson: string } | null {
  const colonIdx = goalId.indexOf(':')
  if (colonIdx === -1) return null
  const type = goalId.slice(0, colonIdx)
  const item = goalId.slice(colonIdx + 1)
  if (!item) return null
  switch (type) {
    case 'gather':
      return { skill: 'dig', paramsJson: JSON.stringify({ target: item, count: 1 }) }
    case 'craft':
      return { skill: 'craft', paramsJson: JSON.stringify({ itemName: item, count: 1 }) }
    case 'smelt':
      return { skill: 'smelt', paramsJson: JSON.stringify({ oreName: item, count: 1 }) }
    case 'ensure':
      // ensure:crafting_table / ensure:furnace → ensureStation é chamado internamente por craft/smelt.
      // Nenhuma ação direta aqui; o craft/smelt seguinte chama ensureStation automaticamente.
      return null
    default:
      return null
  }
}

/**
 * Normaliza o `target` que o nó execute monta para a skill `dig`, que chega em DUAS formas:
 *   - roteador DAG (goalToSkillParams): JSON string de params completos, ex '{"target":"oak_log","count":1}'
 *   - ramo gathering: nome de bloco cru, ex 'oak_log'
 * dig.ts espera SEMPRE { target:<nome|pos>, count? }. Aqui devolvemos esse objeto:
 *   - se `raw` parsear como objeto com .target → usa o objeto de params do DAG direto;
 *   - senão → trata `raw` como nome de bloco cru e devolve { target: raw }.
 * Bug que isto conserta: sem o parse, o ramo DAG passava a JSON-string inteira como nome de bloco
 * (findBlocks(b => b.name === '{"target":"oak_log",...}') → nada encontrado → no_effect em loop).
 */
export function parseDigTarget(raw: string): { target: string | { x: number; y: number; z: number }; count?: number } {
  // Fast-path: nome de bloco cru não começa com '{' nem '[' nem '"'
  const trimmed = raw.trim()
  if (trimmed.length > 0 && (trimmed[0] === '{' || trimmed[0] === '[' || trimmed[0] === '"')) {
    try {
      const parsed = JSON.parse(trimmed)
      // params do DAG: { target, count }. Também aceita target sendo posição {x,y,z}.
      if (parsed && typeof parsed === 'object' && 'target' in parsed) {
        const out: { target: string | { x: number; y: number; z: number }; count?: number } = { target: parsed.target }
        if (typeof parsed.count === 'number') out.count = parsed.count
        return out
      }
      // JSON válido mas sem .target (ex: uma string JSON "oak_log") → usa o valor como nome cru.
      if (typeof parsed === 'string') return { target: parsed }
    } catch {
      /* não é JSON — cai no fast-path de nome cru abaixo */
    }
  }
  return { target: raw }
}

/**
 * ROOT CAUSE (b) fix (OPÇÃO 2 — escalonar na ladder): seleciona o primeiro item da
 * gatheringLadder que falta no inventário (have < minQuantity) E cujo alvo NÃO esteja em
 * cooldown, ESCALONANDO para o próximo item insatisfeito quando o atual está resfriado.
 *
 * Antes, a ponte need→DAG fixava o 1º item insatisfeito (ex: oak_log) mesmo inalcançável —
 * o no_effect punha o alvo em cooldown via recordFailure, mas a ponte ignorava o cooldown e
 * re-selecionava o MESMO item indefinidamente. Aqui pulamos itens resfriados, reusando a infra
 * de cooldown que já existe (safety) sem tocar o módulo puro tech-tree.ts.
 *
 * O cooldown indexa pelo `target` que o execute passou: para um gather DAG é o paramsJson
 * ('{"target":"oak_log","count":1}'); para o ramo gathering não-DAG é o nome cru ('oak_log').
 * Checamos AMBAS as formas. Função PURA (sem bot/Date.now) — testável diretamente.
 *
 * @returns o nome do item a coletar, ou null se TODOS os itens insatisfeitos estão em cooldown.
 */
export function pickTechTarget(
  ladder: ReadonlyArray<string>,
  invCounts: Map<string, number>,
  minQuantity: number,
  cooledDown: Set<string>,
): string | null {
  const isCooledDown = (item: string): boolean =>
    cooledDown.has(item) || cooledDown.has(JSON.stringify({ target: item, count: 1 }))
  for (const item of ladder) {
    const have = invCounts.get(item) ?? 0
    if (have < minQuantity && !isCooledDown(item)) return item
  }
  return null
}

export function createNodes(deps: NodeDeps) {
  const { bot, holder, triggerBus } = deps
  const control = holder.control
  const safety = holder.safety

  // OBSERVE: snapshot imutável (D-04) + pipeline de motivação com pesos por disposição (D-06).
  const observe = async (_s: LoopState): Promise<Partial<LoopState>> => {
    // CR#1 a jusante: a percepção é defensiva (retorna null na morte/void). Um tick que falha na
    // percepção deve degradar para idle, NUNCA derrubar o driver — por isso embrulhamos a chamada:
    // null (corpo ausente) ou exceção inesperada => { snapshot: null }. analyze (if !s.snapshot ->
    // idle) e execute (cada ramo guardado por `if (snap && ...)`) já tratam null com segurança.
    let snapshot: WorldSnapshot | null
    try {
      snapshot = buildWorldSnapshot(bot)
    } catch (err) {
      log(`percepção falhou: ${err instanceof Error ? err.message : err} — tick degrada para idle`)
      snapshot = null
    }
    if (!snapshot) {
      return { snapshot: null }
    }
    const t = now()
    const mcfg = motivationConfigFor(holder.disposition) // pesos POR DISPOSIÇÃO (D-06/D-10)

    // necessidades (NEED-01/02) — escreve no holder (fonte única)
    holder.needs = evaluateNeeds(holder.needs, snapshot, t, mcfg)

    // objetivos (GOAL-01/02): gera candidatos e seleciona com histerese/preempção
    const candidates = generateGoals(holder.needs, t, mcfg)
    const survivalNeed = holder.needs.find((n) => n.kind === 'survival')
    const survivalCritical =
      survivalNeed !== undefined &&
      urgency(survivalNeed, t, mcfg) > 0 &&
      survivalNeed.value < mcfg.survivalCriticalThreshold
    const selected = selectGoal(
      holder.currentGoal,
      candidates,
      {
        survivalCritical,
        playerRequestPending: holder.playerRequestPending,
        disposition: holder.disposition,
      },
      mcfg,
      holder.completedGoalIds, // D-06: filtra goals bloqueados por dependsOn não satisfeitas
    )
    holder.goals = candidates
    holder.currentGoal = selected

    // consumiu um pedido de jogador → reseta o sinal (Plan 04 volta a setá-lo)
    if (selected?.source === 'player_request') holder.playerRequestPending = false

    // === Fase 10 D-09/D-10: Ponte resources need → resolveDag (determinística, sem LLM) ===
    // Quando resources está insatisfeita e o goal atual não é um sub-goal de tech-tree:
    // percorrer gatheringLadder → primeiro item abaixo de resourceMinQuantity → resolveDag.
    // O LLM pode sobrescrever via preempção ASSISTANT (D-10), mas a ponte nunca usa o LLM.
    const resourcesNeed = holder.needs.find(n => n.kind === 'resources')
    const resourcesUrgent = resourcesNeed !== undefined && urgency(resourcesNeed, t, mcfg) > mcfg.goalThreshold
    const currentIsTechGoal = holder.currentGoal !== null &&
      DAG_PREFIXES.some(p => holder.currentGoal!.id.startsWith(p))

    if (resourcesUrgent && !currentIsTechGoal) {
      // ROOT CAUSE (b) fix (OPÇÃO 2): primeiro item da ladder insatisfeito E não-resfriado
      // (pickTechTarget escalona para o próximo quando o atual está em cooldown). Reusa a infra
      // de cooldown de safety sem tocar o módulo puro tech-tree.ts.
      const invCounts = new Map<string, number>()
      for (const slot of snapshot.inventory) {
        invCounts.set(slot.name, (invCounts.get(slot.name) ?? 0) + slot.count)
      }
      const techTarget = pickTechTarget(
        config.gatheringLadder,
        invCounts,
        config.resourceMinQuantity,
        cooledDownTargets(safety, t),
      )

      if (techTarget) {
        // Reconstruir DAG somente se não há sub-goals DAG no holder (D-03: alreadyHasDag guard)
        const alreadyHasDag = holder.goals.some(g => DAG_PREFIXES.some(p => g.id.startsWith(p)))
        if (!alreadyHasDag) {
          try {
            const { resolveDag } = await import('../motivation/tech-tree')
            const dagMemo = new Map()
            const dagResult = resolveDag(techTarget, bot, dagMemo, 0, resourcesNeed ? urgency(resourcesNeed, t, mcfg) : 0.8, t)
            if (!('unresolvable' in dagResult)) {
              // Filtro: não re-inserir goals já completados
              const completedIds = holder.completedGoalIds
              const newGoals = dagResult.filter(g => !completedIds.has(g.id))
              // Substituir sub-goals DAG existentes pelos novos; preservar goals não-DAG
              holder.goals = [
                ...holder.goals.filter(g => !DAG_PREFIXES.some(p => g.id.startsWith(p))),
                ...newGoals,
              ]
              // Selecionar a folha executável: o goal sem dependsOn não satisfeito
              const executableLeaf = newGoals.find(g => g.dependsOn.every(dep => completedIds.has(dep)))
              if (executableLeaf) {
                holder.currentGoal = executableLeaf
              }
            } else {
              log(`[tech-tree] ${techTarget} é unresolvable — ignorando`)
            }
          } catch (err) {
            // Bot sem registry (mock/testes) ou erro inesperado: degradar silenciosamente.
            // O loop cognitivo não pode parar por falha de DAG — Core Value.
            log(`[tech-tree] resolveDag falhou para ${techTarget}: ${err instanceof Error ? err.message : err}`)
          }
        }
      }
    }
    // === Fim da ponte Fase 10 ===

    // Fase 07.1 Plan 03: sinais para o driver event-driven.
    // enteredIdle=true quando não há objetivo ativo (sem skill neste tick = idle genuíno).
    // nextWakeMs: quando idle, usa o intervalo longo; senão, o timeout-piso de navegação.
    const enteredIdle = (holder.currentGoal == null) && (snapshot !== null)
    const nextWakeMs = enteredIdle ? config.idleWakeIntervalMs : config.navigateTimeoutMs
    return {
      snapshot,
      needs: holder.needs,
      goals: holder.goals,
      currentGoal: holder.currentGoal,
      disposition: holder.disposition,
      enteredIdle,
      nextWakeMs,
    }
  }

  // ANALYZE: prefere a decisão LLM FRESCA do holder; senão degrada ao arbiter (D-17).
  const analyze = async (s: LoopState): Promise<Partial<LoopState>> => {
    if (!s.snapshot) return { cogState: 'idle' }
    const excluded = cooledDownTargets(safety, now())

    let next: CognitiveState | null = null
    const fresh = holder.llmDecision
    // frescor: a decisão LLM vale por até 2x o intervalo de replan (D-19); modo de controle pode vetar.
    if (
      fresh &&
      now() - fresh.at < config.replanMinIntervalMs * 2 &&
      control.getMode() === 'autonomous' // paused/standby seguem a arbitragem determinística
    ) {
      next = actionToCognitiveState(fresh.decision.action)
    }

    if (next === null) next = arbitrate(s.snapshot, control.getMode(), excluded) // D-17 fallback
    // Anti-deadlock: recupera o backoff por tempo ANTES de checar o fallback. Sem isto, o Idle de
    // backoff seria permanente (em Idle não há skill → nunca recordSuccess → streak nunca zera).
    decayBackoff(safety, now())
    if (shouldFallbackToIdle(safety)) next = 'idle' // D-11: backoff -> Idle (já recuperável no tempo)
    return { cogState: next }
  }

  // UPDATE MEMORY: no-op nominal — a transição de estado é gravada no execute (precisa do from/to).
  const updateMemory = async (_s: LoopState): Promise<Partial<LoopState>> => {
    return {}
  }

  // DECIDE: resolve um target-hint a partir de currentGoal/llmDecision quando aplicável.
  // Params físicos continuam montados pelo executor/skillRegistry (D-10) — nunca pelo LLM cru.
  const decide = async (_s: LoopState): Promise<Partial<LoopState>> => {
    return {}
  }

  // EXECUTE: dispara NO MÁXIMO uma skill (D-02 single-flight). Grava memória NO HOLDER (fonte única).
  const execute = async (s: LoopState): Promise<Partial<LoopState>> => {
    const snap = s.snapshot
    // GAP-01: aldeão percebido → POI village no local (1x por tick; dedup por bucket evita flood).
    if (snap && holder.db) recordVillagePoi(holder.db, snap, now())
    const state = s.cogState
    const fresh = holder.llmDecision
    const llmTarget =
      fresh && now() - fresh.at < config.replanMinIntervalMs * 2 ? fresh.decision.target : undefined

    log(`estado=${state} modo=${control.getMode()} objetivo=${holder.currentGoal?.id ?? '-'}`)

    // mapeia estado -> (skill, target). Apenas estados ativos disparam skill.
    let skill: string | null = null
    let target = ''

    // === Fase 10 D-09/D-10: Roteador determinístico de sub-goals do DAG ===
    // Se o currentGoal é um sub-goal do DAG (prefixo gather:/craft:/smelt:/ensure:),
    // rotear para a skill correspondente SEM depender do estado cognitivo ou da decisão LLM.
    // Isso é a ponte determinística: o LLM não precisa conhecer a cadeia de tech-tree.
    const currentGoal = holder.currentGoal
    // ROOT CAUSE (b) fix (OPÇÃO 1 reduzida — escape final): quando o sub-goal DAG atual JÁ está
    // em cooldown (escalonamento da ladder esgotado: o alvo é inalcançável e voltou a ser
    // selecionado), uma decisão FRESCA action=explore/navigate do LLM pode redirecionar o canal
    // para o ramo 'exploring' em vez do roteador forçar dig no mesmo alvo travado. Sem isto, o
    // roteador DAG vence o llmDecision sempre, e explore nunca vira navigate (loop sem escape).
    const dagRouting = currentGoal ? goalToSkillParams(currentGoal.id) : null
    const dagTargetCooledDown =
      dagRouting !== null && cooledDownTargets(safety, now()).has(dagRouting.paramsJson)
    const llmWantsEscape =
      fresh !== undefined &&
      fresh !== null &&
      now() - fresh.at < config.replanMinIntervalMs * 2 &&
      (fresh.decision.action === 'explore' || fresh.decision.action === 'navigate')
    const dagRouterYieldsToExplore = dagTargetCooledDown && llmWantsEscape
    if (dagRouterYieldsToExplore) {
      log(`[tech-tree] ${currentGoal!.id} em cooldown — cedendo ao explore do LLM (escape final)`)
    }
    if (
      snap &&
      currentGoal &&
      DAG_PREFIXES.some(p => currentGoal.id.startsWith(p)) &&
      !dagRouterYieldsToExplore
    ) {
      const routing = goalToSkillParams(currentGoal.id)
      if (routing) {
        skill = routing.skill
        target = routing.paramsJson
        log(`[tech-tree] roteando ${currentGoal.id} → ${skill}`)
      } else {
        // 'ensure:*' ou prefixo desconhecido: marcar como completo automaticamente
        // (ensureStation é chamado pelas skills de craft/smelt que verificam o estado real)
        log(`[tech-tree] sub-goal ${currentGoal.id} é no-op (ensure) — avançando automaticamente`)
        const goalId = currentGoal.id
        const updated = advanceProgress(currentGoal, 1)
        holder.goals = holder.goals.map(g => g.id === goalId ? updated : g)
        holder.currentGoal = updated
        if (!holder.completedGoalIds) holder.completedGoalIds = new Set()
        holder.completedGoalIds.add(goalId)
      }
    }
    // === Fim do roteador Fase 10 ===

    if (!skill && snap && state === 'gathering') {
      // alvo do LLM (se for um bloco da escada presente) tem preferência; senão a escada de prioridade.
      const cd = cooledDownTargets(safety, now())
      const llmBlock =
        llmTarget && snap.nearbyBlockTypes[llmTarget] && !cd.has(llmTarget) ? llmTarget : null
      const t = llmBlock ?? highestPriorityGatherTarget(snap, cd)
      if (t) {
        skill = 'dig'
        target = t
      }
    }
    if (!skill && snap && state === 'exploring') {
      // exploring: navega para um ponto deslocado (vaguear visível). Sem alvo de bloco.
      skill = 'navigate'
      const p = snap.status.position
      target = JSON.stringify({
        x: Math.round(p.x + (Math.random() * 16 - 8)),
        y: Math.round(p.y),
        z: Math.round(p.z + (Math.random() * 16 - 8)),
      })
    }
    if (!skill && snap && state === 'socializing') {
      // standby/jogador próximo: SÓ se aproxima se estiver LONGE. Já dentro de socialArriveRadius
      // => fica parado neste tick. Sem isso, a posição do jogador oscila nos decimais a cada tick,
      // a string-alvo muda, o guard anti-repetição nunca acumula e o bot re-navega pro mesmo ponto
      // infinitamente (flood de 'OK navigate'). Distância calculada do bot, não confia em p.distance.
      const player = [...snap.players]
        .filter((p) => p.position)
        .sort((a, b) => (a.distance ?? 1e9) - (b.distance ?? 1e9))[0]
      if (player?.position) {
        const bp = snap.status.position
        const dx = player.position.x - bp.x
        const dy = player.position.y - bp.y
        const dz = player.position.z - bp.z
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
        if (dist > config.socialArriveRadius) {
          skill = 'navigate'
          target = JSON.stringify(player.position)
        }
      }
    }
    if (!skill && snap && state === 'building' && fresh) {
      // G-01: o estado 'building' agrega craft/smelt/equip/place — resolve o VERBO da decisão LLM
      // (não do state agregado) e monta os params físicos do target de alto nível. target inválido
      // (item vazio / posição não-parseável) NÃO seta skill → degrada para sem-ação (Core Value).
      const verb = fresh.decision.action
      const raw = (llmTarget ?? '').trim()
      if (verb === 'craft' && raw) {
        // "item" ou "item:N"
        const [name, n] = raw.split(':')
        const count = Math.min(64, Math.max(1, parseInt(n ?? '1', 10) || 1))
        skill = 'craft'
        target = JSON.stringify({ itemName: name!.trim(), count })
      } else if (verb === 'smelt' && raw) {
        const [name, n] = raw.split(':')
        const count = Math.min(64, Math.max(1, parseInt(n ?? '1', 10) || 1))
        skill = 'smelt'
        target = JSON.stringify({ oreName: name!.trim(), count })
      } else if (verb === 'equip' && raw) {
        // "item" ou "item@slot"
        const [name, slot] = raw.split('@')
        const dest = slot?.trim()
        skill = 'equip'
        target = JSON.stringify(dest ? { itemName: name!.trim(), destination: dest } : { itemName: name!.trim() })
      } else if (verb === 'place' && raw) {
        // "nome @ x,y,z" — exige posição; sem ela NÃO dispara (degrada para sem-ação).
        const [name, posStr] = raw.split('@')
        const coords = posStr?.split(',').map((c) => parseInt(c.trim(), 10))
        if (coords && coords.length === 3 && coords.every((c) => Number.isFinite(c))) {
          // A chave do registry para colocar bloco é 'placeBlock' (não 'place').
          skill = 'placeBlock'
          target = JSON.stringify({ target: { x: coords[0], y: coords[1], z: coords[2] }, itemName: name!.trim() })
        }
      }
    }
    // idle / fighting(stub): nenhuma skill (D-06)

    if (!skill) {
      log(`sem acao (estado=${state})`)
      // Fase 07.1 Plan 03: emit actionFinished mesmo sem skill — o driver precisa acordar
      // para que o loop continue (D-01/T-07.1-10: grounding não é aplicável aqui).
      triggerBus.emit('actionFinished', { skill: null, outcome: null })
      return { memory: holder.memory }
    }

    // D-10: anti-repetição
    recordAttempt(safety, skill, target)
    if (shouldAbandon(safety)) {
      log(`abandonando ${skill}:${target} (repetido ${config.antiRepeatN}x sem progresso)`)
      recordFailure(safety, target, now())
      recordEvent(holder, {
        type: 'action',
        skill,
        target,
        outcome: 'no_effect',
        observed: 0,
        expected: 0,
        result: 'failure',
        reason: 'anti-repeat',
        timestamp: now(),
      }, now())
      // Fase 07.1 Plan 03: emit após grounding do abandon (holder.lastObservedDelta não é atualizado
      // aqui mas não há lastObservedDelta a ler — o driver apenas acorda para o próximo tick).
      triggerBus.emit('actionFinished', { skill, outcome: 'no_effect' })
      return { memory: holder.memory }
    }

    // D-02: single-flight — UMA skill, aguardada.
    // 999.1 D-06: sem wrap externo — cada skill se auto-embrulha em executeWithSafety com seu
    // próprio progressChecker (dig usa inventário; navigate usa navigateTimeoutMs). O wrap externo
    // usava defaults genéricos e duplicava o watchdog interno.
    //
    // D-16/D-18: AbortController por skill-run para preempção event-driven
    const skillAbort = new AbortController()

    // Registrar listeners ANTES de chamar a skill.
    // Fase 8 (D-02/D-07/Pattern 2): a preempção, que na Fase 07.1 cobria só hostileNearby (D-18),
    // foi GENERALIZADA para TODOS os gatilhos lifeCritical. Cada listener força setGoal(null) — parada
    // FÍSICA imediata do pathfinder (D-07, não stop() gracioso) — ANTES de abortar o signal da skill.
    const preemptListeners: Array<[string, () => void]> = []
    for (const trig of LIFE_CRITICAL_TRIGGERS) {
      const fn = () => {
        log(`preemptando ${skill} — ${trig} (lifeCritical)`)
        // D-07: parada FORÇADA imediata do pathfinder ANTES do abort do signal.
        try { bot.pathfinder.setGoal(null) } catch { /* pathfinder pode não estar carregado */ }
        skillAbort.abort(trig)
      }
      triggerBus.once(trig, fn)
      preemptListeners.push([trig, fn])
    }

    // Fase 07.1 Plan 03: variável para carregar o resultado entre try/catch e o emit final.
    // CRITÉRIO DE ORDEM: emit SEMPRE após holder.lastObservedDelta atribuído (Pitfall 1 da research).
    let skillOutcome: import('../grounding/types').SkillOutcome | null = null
    try {
      // dig recebe params completo {target, count?}; navigate recebe {target:{x,y,z}}; os 4 verbos
      // G-01 (craft/smelt/equip/placeBlock) recebem o OBJETO de params completo no topo (spread).
      //
      // IMPORTANTE (bug param-passing): `target` chega em DUAS formas incompatíveis conforme o ramo:
      //   - roteador DAG (nodes.ts:304): target = paramsJson = '{"target":"oak_log","count":1}'
      //   - ramo gathering (nodes.ts:328): target = nome de bloco cru = 'oak_log'
      // dig DEVE receber sempre { target:<nome|pos>, count? }. Normalizamos: se `target` parsear como
      // objeto JSON, usamos-o direto (DAG); senão tratamos como nome de bloco cru (gathering). Sem isso
      // o ramo DAG passava a JSON-string inteira como nome de bloco → findBlocks não acha nada → no_effect.
      const params = skill === 'dig'
        ? { ...parseDigTarget(target), signal: skillAbort.signal }
        : skill === 'navigate'
          ? { target: JSON.parse(target), signal: skillAbort.signal }
          : { ...JSON.parse(target), signal: skillAbort.signal } // craft/smelt/equip/placeBlock
      // D-09 B: a memória deriva do SkillResult OBSERVADO (result.outcome), NUNCA do não-throw.
      // Mata o bug histórico "peguei 10 tábuas" (success por Promise resolvida com observed:0).
      const result = await skillRegistry[skill!]!(bot, params)
      const success = result.outcome === 'success'
      if (success) {
        recordSuccess(safety)
        // D-07/TECH-03: sub-goal do DAG completo quando outcome=success — avança progresso
        // e registra no set de completos para selectGoal filtrar no próximo tick (D-06).
        if (holder.currentGoal) {
          const goalId = holder.currentGoal.id
          const updated = advanceProgress(holder.currentGoal, 1)
          holder.goals = holder.goals.map(g => g.id === goalId ? updated : g)
          holder.currentGoal = updated
          holder.completedGoalIds.add(goalId)
        }
      } else {
        recordFailure(safety, target, now()) // GRND-04: partial/no_effect/error = não-sucesso
      }
      // grounding gravado ANTES do emit (Pitfall 1 / T-07.1-10)
      holder.lastObservedDelta = {
        skill,
        target,
        outcome: result.outcome,
        observed: result.observed,
        expected: result.expected,
        delta: { ...result.delta },
        at: now(),
      }
      recordEvent(holder, {
        type: 'action',
        skill,
        target,
        outcome: result.outcome,
        observed: result.observed,
        expected: result.expected,
        result: success ? 'success' : 'failure', // derivado (GRND-04)
        reason: result.reason,
        timestamp: now(),
      }, now())
      // GAP-01: coleta/mineração com SUCESSO → POI resource no local do recurso (replica o padrão
      // death→danger de loop.ts:267). recordResourcePoi filtra outcome !== 'success' internamente.
      if (snap && holder.db) recordResourcePoi(holder.db, snap, target, result.outcome, now())
      // Observabilidade: em outcome não-sucesso, anexar result.reason ao log para revelar
      // POR QUE a skill não progrediu (ex: NO_EFFECT dig oak_log (0/1) — <reason>). Sem isto
      // o loop fica cego à causa real de um no_effect/partial. Sucesso mantém log limpo.
      const reasonSuffix = result.outcome !== 'success' && result.reason ? ` — ${result.reason}` : ''
      log(`${result.outcome.toUpperCase()} ${skill} ${target} (${result.observed}/${result.expected})${reasonSuffix}`)
      skillOutcome = result.outcome
    } catch (err) {
      // Catch agora SÓ para exceções genuínas inesperadas (D-12) — skills não lançam como fluxo.
      // Inclui AbortError quando a skill não tratar o signal internamente.
      const reason = err instanceof Error ? err.name : String(err)
      recordFailure(safety, target, now())
      // grounding gravado ANTES do emit (Pitfall 1 / T-07.1-10)
      holder.lastObservedDelta = { skill, target, outcome: 'error', observed: 0, expected: 0, delta: {}, at: now() }
      recordEvent(holder, {
        type: 'action',
        skill,
        target,
        outcome: 'error',
        observed: 0,
        expected: 0,
        result: 'failure',
        reason,
        timestamp: now(),
      }, now())
      skillOutcome = 'error'
      log(`ERRO inesperado ${skill} ${target}: ${reason}`)
    } finally {
      // D-18/Pitfall 6: remover TODOS os listeners ANTES do abort() (evitar listener orphan)
      for (const [trig, fn] of preemptListeners) triggerBus.off(trig, fn)
      skillAbort.abort()  // cleanup idempotente — no-op se já foi abortado
    }

    // === Fase 10 D-03: Reconstrução do DAG em falha de sub-goal ===
    // Quando resultado é no_effect em sub-goal do DAG, limpar os sub-goals do holder
    // para forçar reconstrução no próximo tick (alreadyHasDag fica false no observe).
    if (
      skillOutcome === 'no_effect' &&
      currentGoal &&
      DAG_PREFIXES.some(p => currentGoal.id.startsWith(p))
    ) {
      log(`[tech-tree] ${currentGoal.id} retornou no_effect — limpando sub-goals DAG para reconstrução`)
      // Remove todos os sub-goals do DAG do holder (qualquer goal com prefixo DAG)
      holder.goals = holder.goals.filter(
        g => !DAG_PREFIXES.some(p => g.id.startsWith(p))
      )
      // Limpar currentGoal DAG para que o observe não tente executar o mesmo sub-goal novamente
      if (holder.currentGoal && DAG_PREFIXES.some(p => holder.currentGoal!.id.startsWith(p))) {
        holder.currentGoal = null
      }
      // O observe no próximo tick vai verificar alreadyHasDag=false e reconstruir o DAG
    }
    // === Fim D-03 ===

    // Fase 07.1 Plan 03: emit após try/catch/finally — grounding já gravado (Pitfall 1 / T-07.1-10)
    triggerBus.emit('actionFinished', { skill, outcome: skillOutcome })
    return { memory: holder.memory }
  }

  return { observe, analyze, updateMemory, decide, execute }
}
