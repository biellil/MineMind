// src/config.ts
// Bun carrega .env automaticamente via process.env — sem necessidade de dotenv
// Source: https://bun.sh/docs/runtime/env

export const config = {
  // Conexão Minecraft (D-06)
  host: process.env.MC_HOST ?? 'localhost',
  port: parseInt(process.env.MC_PORT ?? '25565', 10),
  username: process.env.MC_USERNAME ?? 'MineMind',
  mcVersion: process.env.MC_VERSION ?? '1.21.4',  // D-03: 1.21.4 recomendado

  // Percepção (D-07)
  perceptionRadius: parseInt(process.env.PERCEPTION_RADIUS ?? '32', 10),

  // Timeouts de skills em ms (D-13, Claude's discretion: 30s navigate, 10s dig)
  navigateTimeoutMs: parseInt(process.env.NAVIGATE_TIMEOUT_MS ?? '30000', 10),
  digTimeoutMs: parseInt(process.env.DIG_TIMEOUT_MS ?? '10000', 10),

  // Reconexão
  reconnectDelayMs: 5_000,  // 5s fixo — não configurável via .env (low-risk)
} as const

// Validação de sanidade em startup
if (config.perceptionRadius < 1 || config.perceptionRadius > 128) {
  throw new Error(`PERCEPTION_RADIUS inválido: ${config.perceptionRadius}. Deve ser entre 1 e 128.`)
}
if (config.port < 1 || config.port > 65535) {
  throw new Error(`MC_PORT inválido: ${config.port}. Deve ser entre 1 e 65535.`)
}
