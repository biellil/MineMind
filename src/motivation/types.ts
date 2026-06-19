// src/motivation/types.ts
// Tipos do sistema de motivação intrínseca (Fase 3 — NEED-01/02, GOAL-01/02).
// Declarações de tipo PURAS — sem dependência de bot/LLM/config global.
// O eixo de disposição é declarado LOCALMENTE aqui para manter o Plan 02
// independente do Plan 01; o Plan 03 reconcilia com src/llm/prompts.ts
// (ambos são a mesma string-literal union, compatíveis estruturalmente).

/** As 5 necessidades do agente. shelter/social são stub nesta fase (D-08). */
export type NeedKind = 'survival' | 'resources' | 'curiosity' | 'shelter' | 'social'

/** Necessidades com decaimento real nesta fase (D-08). */
export const ACTIVE_NEEDS: NeedKind[] = ['survival', 'resources', 'curiosity']

/** Necessidades presentes apenas como stub — sem decaimento real (D-08). */
export const STUB_NEEDS: NeedKind[] = ['shelter', 'social']

/** Uma necessidade interna. value 0..1 (1 = totalmente satisfeita). */
export interface Need {
  kind: NeedKind
  /** Grau de satisfação, 0..1 (1 = satisfeita). */
  value: number
  /** Timestamp (ms) do último atendimento — base do anti-starvation (D-11). */
  lastSatisfiedAt: number
}

/** Origem de um objetivo dinâmico (D-16). */
export type GoalSource = 'need' | 'player_request'

/** Objetivo dinâmico com prioridade, progresso e dependências (GOAL-01/D-16). */
export interface Goal {
  id: string
  kind: string
  /** Prioridade (deriva da urgência da necessidade de origem). */
  priority: number
  /** Progresso 0..1. */
  progress: number
  /**
   * Dependências estruturais (D-16): nesta fase é SEMPRE [] e NÃO é
   * consultado por selectGoal. A resolução comportamental de dependências
   * entre objetivos fica para iteração futura (gap conhecido, ver SUMMARY).
   */
  dependsOn: string[]
  source: GoalSource
  /** Timestamp (ms) em que o objetivo foi gerado/comprometido. */
  committedAt: number
}

/**
 * Eixo de disposição/persona (D-04). Ortogonal aos modos de controle da Fase 2.
 * Declarado localmente aqui — o Plan 03 reconcilia com src/llm/prompts.ts.
 */
export type Disposition = 'AUTONOMOUS' | 'ASSISTANT'

/** Contexto de preempção passado a selectGoal (D-15). */
export interface SelectGoalContext {
  /** Sobrevivência crítica — preempta sempre (D-15a). */
  survivalCritical: boolean
  /** Há pedido de jogador pendente — preempta só em ASSISTANT (D-15b/D-13). */
  playerRequestPending: boolean
  disposition: Disposition
}

/**
 * Config do sistema de motivação. As funções puras deste plano permanecem
 * AGNÓSTICAS de disposição: recebem QUALQUER MotivationConfig por parâmetro e
 * nunca leem disposição diretamente. O Plan 03 deriva um MotivationConfig
 * distinto por disposição (motivationConfigFor) e passa o cfg correto.
 */
export interface MotivationConfig {
  /** Pesos por necessidade — por-disposição (D-06/D-10), valores no Plan 03. */
  weights: Record<NeedKind, number>
  /** Decaimento de curiosidade por ms ignorado (D-09). */
  curiosityDecayPerMs: number
  /** Boost de urgência por ms desde lastSatisfiedAt (anti-starvation D-11). */
  starvationBoostPerMs: number
  /** Limiar de urgência para uma necessidade virar objetivo (GOAL-01). */
  goalThreshold: number
  /** Margem de histerese para trocar de objetivo (GOAL-02/D-15). */
  hysteresisMargin: number
  /** Limiar de value de survival abaixo do qual é "crítico" (consumidor: Plan 03). */
  survivalCriticalThreshold: number
  /** Nomes de itens-alvo de recurso (satisfação = fração presente no inventário). */
  resourceTargets: string[]
}
