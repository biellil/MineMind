// src/config.ts
// Bun carrega .env automaticamente via process.env — sem necessidade de dotenv
// Source: https://bun.sh/docs/runtime/env
import type { Disposition, MotivationConfig, NeedKind } from './motivation/types'

// Use || instead of ?? for env vars: empty string ('') is falsy and must fall back to default
export const config = {
  // Conexão Minecraft (D-06)
  host: process.env.MC_HOST || 'localhost',
  port: parseInt(process.env.MC_PORT || '25565', 10),
  username: process.env.MC_USERNAME || 'MineMind',
  mcVersion: process.env.MC_VERSION || '1.21.4',  // D-03: 1.21.4 recomendado

  // Percepção (D-07)
  perceptionRadius: parseInt(process.env.PERCEPTION_RADIUS || '32', 10),

  // Timeouts de skills em ms (D-13, Claude's discretion: 30s navigate, 10s dig)
  navigateTimeoutMs: parseInt(process.env.NAVIGATE_TIMEOUT_MS || '30000', 10),
  digTimeoutMs: parseInt(process.env.DIG_TIMEOUT_MS || '10000', 10),

  // Reconexão
  reconnectDelayMs: 5_000,  // 5s fixo — não configurável via .env (low-risk)

  // === Fase 2: Loop cognitivo ===
  // D-02: intervalo mínimo entre ticks do driver externo
  minTickMs: parseInt(process.env.MIN_TICK_MS || '500', 10),
  // D-07: escada de prioridade de sobrevivência (mais prioritário primeiro).
  // O agente coleta o bloco de MAIOR prioridade presente em nearbyBlockTypes.
  gatheringLadder: [
    'oak_log', 'birch_log', 'spruce_log', 'jungle_log', 'acacia_log', 'dark_oak_log',  // madeira (ferramentas)
    'cobblestone', 'stone',                                                              // pedra
    'coal_ore', 'iron_ore', 'copper_ore',                                               // minérios básicos
    'diamond_ore', 'gold_ore',                                                          // minérios valiosos
  ] as ReadonlyArray<string>,
  // D-10: repetições da mesma ação/alvo sem progresso antes de abandonar
  antiRepeatN: parseInt(process.env.ANTI_REPEAT_N || '3', 10),
  // D-11: falhas consecutivas de skill antes de cair para Idle
  backoffM: parseInt(process.env.BACKOFF_M || '3', 10),
  // D-11: cooldown curto (ms) de um alvo marcado como falho
  targetCooldownMs: parseInt(process.env.TARGET_COOLDOWN_MS || '15000', 10),
  // D-05: raio (blocos) para considerar um jogador "próximo" (gatilho de Socializing)
  socialRadius: parseInt(process.env.SOCIAL_RADIUS || '8', 10),
  // D-13: orçamento de tokens da memória de curto prazo (override do default do módulo)
  memoryTokenBudget: parseInt(process.env.MEMORY_TOKEN_BUDGET || '2000', 10),

  // === Fase 3: LLM, disposição, necessidades, objetivos ===
  // LLM local via LM Studio (LLM-01/02/03 — degradação graciosa quando off, D-17)
  llmBaseUrl: process.env.LLM_BASE_URL || 'http://localhost:1234/v1',
  llmModel: process.env.LLM_MODEL || 'local-model',
  // Temperatura baixa favorece structured output estável em modelos locais (D-18)
  llmTemperature: parseFloat(process.env.LLM_TEMPERATURE || '0.4'),
  // D-04: disposição padrão (eixo de persona/proatividade)
  dispositionDefault: (process.env.DISPOSITION_DEFAULT || 'AUTONOMOUS') as Disposition,
  // D-12: proatividade da camada conversacional
  proactivity: (process.env.PROACTIVITY || 'reactive') as 'reactive' | 'proactive',
  // D-19: orçamento de replanejamento — intervalo mínimo entre deliberações LLM (default conservador/lento)
  replanMinIntervalMs: parseInt(process.env.REPLAN_MIN_INTERVAL_MS || '8000', 10),
  // D-09: decaimento de curiosidade por ms ignorado
  curiosityDecayPerMs: parseFloat(process.env.CURIOSITY_DECAY_PER_MS || '0.00001'),
  // D-11: boost de urgência por ms (anti-starvation monotônico)
  starvationBoostPerMs: parseFloat(process.env.STARVATION_BOOST_PER_MS || '0.000005'),
  // GOAL-01: limiar de urgência para uma necessidade virar objetivo
  goalThreshold: parseFloat(process.env.GOAL_THRESHOLD || '0.5'),
  // D-15: margem de histerese para trocar de objetivo (alta/conservadora)
  hysteresisMargin: parseFloat(process.env.HYSTERESIS_MARGIN || '0.25'),
  // D-15: limiar de value de survival abaixo do qual é "crítico" (preempção por perigo)
  survivalCriticalThreshold: parseFloat(process.env.SURVIVAL_CRITICAL_THRESHOLD || '0.3'),
  // Itens-alvo de recurso (satisfação de resources = fração presente no inventário)
  resourceTargets: (process.env.RESOURCE_TARGETS || 'oak_log,cobblestone,bread').split(','),
} as const

// === Fase 3: pesos de necessidade POR DISPOSIÇÃO (D-06/D-10) ===
// O eixo de disposição modula o peso das necessidades. Defaults concretos, sobrescrevíveis
// por envs opcionais por disposição: NEED_WEIGHT_<DISP>_SURVIVAL/RESOURCES/CURIOSITY.

/** Lê um peso por disposição do ambiente, com fallback ao default concreto. */
function envWeight(disposition: 'AUTONOMOUS' | 'ASSISTANT', need: 'SURVIVAL' | 'RESOURCES' | 'CURIOSITY', def: number): number {
  const raw = process.env[`NEED_WEIGHT_${disposition}_${need}`]
  return raw !== undefined && raw !== '' ? parseFloat(raw) : def
}

/**
 * Pesos de necessidade por disposição (D-06/D-10). Função PURA de leitura de config —
 * NÃO é estado global. AUTONOMOUS é equilibrado (explora/coleta/sobrevive sem viés a
 * jogadores); ASSISTANT reduz curiosity (fica mais disponível) mantendo survival como
 * PISO anti-starvation (nunca abaixo dos demais — casa com D-11/D-15a).
 */
export function needWeightsFor(disposition: Disposition): Record<NeedKind, number> {
  if (disposition === 'ASSISTANT') {
    return {
      survival: envWeight('ASSISTANT', 'SURVIVAL', 1.0),
      resources: envWeight('ASSISTANT', 'RESOURCES', 0.9),
      curiosity: envWeight('ASSISTANT', 'CURIOSITY', 0.4),
      shelter: 0,
      social: 0,
    }
  }
  // AUTONOMOUS (default): as 3 ativas equilibradas.
  return {
    survival: envWeight('AUTONOMOUS', 'SURVIVAL', 1.0),
    resources: envWeight('AUTONOMOUS', 'RESOURCES', 1.0),
    curiosity: envWeight('AUTONOMOUS', 'CURIOSITY', 1.0),
    shelter: 0,
    social: 0,
  }
}

/**
 * Deriva um MotivationConfig completo para uma disposição (D-06). É ESTA função
 * (não um cfg global único) que observe/deliberation chamam com holder.disposition
 * para passar às funções puras do Plan 02 (evaluateNeeds/generateGoals/selectGoal).
 */
export function motivationConfigFor(disposition: Disposition): MotivationConfig {
  return {
    weights: needWeightsFor(disposition),
    curiosityDecayPerMs: config.curiosityDecayPerMs,
    starvationBoostPerMs: config.starvationBoostPerMs,
    goalThreshold: config.goalThreshold,
    hysteresisMargin: config.hysteresisMargin,
    survivalCriticalThreshold: config.survivalCriticalThreshold,
    resourceTargets: config.resourceTargets,
  }
}

/** MotivationConfig default (= disposição padrão da config) — conveniência/retrocompat. */
export const motivationConfig: MotivationConfig = motivationConfigFor(config.dispositionDefault)

// Validação de sanidade em startup
if (config.perceptionRadius < 1 || config.perceptionRadius > 128) {
  throw new Error(`PERCEPTION_RADIUS inválido: ${config.perceptionRadius}. Deve ser entre 1 e 128.`)
}
if (config.port < 1 || config.port > 65535) {
  throw new Error(`MC_PORT inválido: ${config.port}. Deve ser entre 1 e 65535.`)
}
// Fase 2: validação dos parâmetros do loop cognitivo
if (config.minTickMs < 0) {
  throw new Error(`MIN_TICK_MS inválido: ${config.minTickMs}. Deve ser >= 0.`)
}
if (config.antiRepeatN < 1 || config.backoffM < 1) {
  throw new Error(`ANTI_REPEAT_N (${config.antiRepeatN}) e BACKOFF_M (${config.backoffM}) devem ser >= 1.`)
}
// Fase 3: validação dos parâmetros de LLM/disposição/necessidades/objetivos
if (config.replanMinIntervalMs < 0) {
  throw new Error(`REPLAN_MIN_INTERVAL_MS inválido: ${config.replanMinIntervalMs}. Deve ser >= 0.`)
}
for (const [name, v] of [
  ['GOAL_THRESHOLD', config.goalThreshold],
  ['HYSTERESIS_MARGIN', config.hysteresisMargin],
  ['SURVIVAL_CRITICAL_THRESHOLD', config.survivalCriticalThreshold],
] as const) {
  if (v < 0 || v > 1) throw new Error(`${name} inválido: ${v}. Deve estar em [0,1].`)
}
if (config.dispositionDefault !== 'AUTONOMOUS' && config.dispositionDefault !== 'ASSISTANT') {
  throw new Error(`DISPOSITION_DEFAULT inválido: ${config.dispositionDefault}. Deve ser AUTONOMOUS ou ASSISTANT.`)
}
