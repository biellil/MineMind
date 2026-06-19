// src/config.ts
// Bun carrega .env automaticamente via process.env — sem necessidade de dotenv
// Source: https://bun.sh/docs/runtime/env

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
} as const

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
