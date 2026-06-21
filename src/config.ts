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

  // 999.1 D-01: raio de busca de coleta — INDEPENDENTE de perceptionRadius.
  // dig.ts usa este valor no findBlocks({ maxDistance }); percepção (snapshot.ts) mantém perceptionRadius.
  gatherSearchRadius: parseInt(process.env.GATHER_SEARCH_RADIUS || '16', 10),
  // C-fix: timeout (ms) do pré-check de alcançabilidade do gather (getPathTo, dig.ts). 200ms era
  // curto demais p/ o A* — rejeitava blocos alcançáveis como "inalcançáveis" e o bot ficava parado
  // (no_effect sem se mover). Roda em 1 bloco (count=1), então 1500ms é barato. 0 desativa o pré-check.
  gatherReachTimeoutMs: parseInt(process.env.GATHER_REACH_TIMEOUT_MS || '1500', 10),
  // 999.1 D-02: bounds do A* do pathfinder — ativam o gate maxCost (raiz do fix de OOM).
  // searchRadius ≈ 1.5-2× perceptionRadius (default 48); thinkTimeout secundário (default 2000ms).
  pathfinderSearchRadius: parseInt(process.env.PATHFINDER_SEARCH_RADIUS || '48', 10),
  pathfinderThinkTimeoutMs: parseInt(process.env.PATHFINDER_THINK_TIMEOUT_MS || '2000', 10),

  // Timeouts de skills em ms (D-13, Claude's discretion: 30s navigate, 10s dig)
  navigateTimeoutMs: parseInt(process.env.NAVIGATE_TIMEOUT_MS || '30000', 10),
  digTimeoutMs: parseInt(process.env.DIG_TIMEOUT_MS || '10000', 10),
  // Fase 9: timeouts de placement/smelting (D-04/D-10, Claude's discretion sobre valores)
  placeTimeoutMs: parseInt(process.env.PLACE_TIMEOUT_MS || '6000', 10),       // > os 5000 internos do blockUpdate
  placeRetries: parseInt(process.env.PLACE_RETRIES || '0', 10),               // D-04: campo RESERVADO p/ fase futura; o CORPO do retry NAO e implementado nesta fase (default off — gap intencional)
  smeltUpdateTimeoutMs: parseInt(process.env.SMELT_UPDATE_TIMEOUT_MS || '12000', 10), // > 10s/item
  smeltTimeoutMs: parseInt(process.env.SMELT_TIMEOUT_MS || '15000', 10),      // teto total por item
  // Distância (blocos) a partir da qual o bot PARA de se reaproximar do jogador no estado socializing.
  // Já dentro do raio => fica parado (evita o re-navigate infinito pela jitter da posição do jogador).
  socialArriveRadius: parseInt(process.env.SOCIAL_ARRIVE_RADIUS || '3', 10),

  // Reconexão
  reconnectDelayMs: 5_000,  // 5s fixo — não configurável via .env (low-risk)
  // Máximo de tentativas de reconexão CONSECUTIVAS (sem spawn bem-sucedido) antes de desistir.
  // Evita o loop infinito de reconexão que vaza memória quando o servidor está fora do ar.
  // O contador zera a cada spawn bem-sucedido (uma sessão saudável ganha tentativas novas).
  maxReconnectAttempts: parseInt(process.env.MAX_RECONNECT_ATTEMPTS || '5', 10),

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
  // Anti-deadlock: ms "descansando" em Idle (desde a última falha) antes de zerar o streak de
  // backoff e o bot voltar a tentar. Sem isto o fallback-to-Idle é permanente (bot congela).
  backoffRecoveryMs: parseInt(process.env.BACKOFF_RECOVERY_MS || '10000', 10),
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
  // D-12: subido 0.3→0.5 — vida crítica preempta/foge/abriga
  survivalCriticalThreshold: parseFloat(process.env.SURVIVAL_CRITICAL_THRESHOLD || '0.5'),
  // Itens-alvo de recurso (satisfação de resources = fração presente no inventário)
  resourceTargets: (process.env.RESOURCE_TARGETS || 'oak_log,cobblestone,bread').split(','),

  // === Fase 4: Persistência, reflexão, identidade ===
  // D-01/D-02: caminho do arquivo SQLite (store único relacional + vetorial)
  dbPath: process.env.DB_PATH || './minemind.sqlite',
  // D-09: modelo de embedding no LM Studio + dimensão (Pitfall 2 — validar no boot)
  embeddingModel: process.env.EMBEDDING_MODEL || 'text-embedding-qwen3-embedding-0.6b',
  embeddingDim: parseInt(process.env.EMBEDDING_DIM || '1024', 10),
  // D-06: limiar de importância mínimo para persistir um evento em LP (descarta ticks triviais — Pitfall 6)
  ltImportanceFloor: parseInt(process.env.LT_IMPORTANCE_FLOOR || '3', 10),
  // D-07: meia-vida de recência (ms) e nº de candidatos KNN antes da reordenação ponderada
  retrievalHalfLifeMs: parseInt(process.env.RETRIEVAL_HALF_LIFE_MS || String(6 * 60 * 60 * 1000), 10),
  retrievalK: parseInt(process.env.RETRIEVAL_K || '12', 10),
  // D-10: gatilho de reflexão (soma de importância) + teto temporal anti-starvation (ms)
  reflectionImportanceThreshold: parseInt(process.env.REFLECTION_IMPORTANCE_THRESHOLD || '50', 10),
  reflectionMaxIntervalMs: parseInt(process.env.REFLECTION_MAX_INTERVAL_MS || String(10 * 60 * 1000), 10),
  // B2: intervalo do flush periódico da mente ao disco — bound na perda por crash duro (OOM/kill).
  // Independe da reflexão e do SIGINT/SIGTERM. 0 desativa o flush periódico (só reflexão/signal/end).
  holderFlushIntervalMs: parseInt(process.env.HOLDER_FLUSH_INTERVAL_MS || '30000', 10),
  // CR#3: intervalo (ms) da poda periódica do checkpointer (MemorySaver in-memory, thread_id fixo).
  // deleteThread('minemind-agent') limpa o histórico acumulado. 0 desativa a poda.
  checkpointPruneIntervalMs: parseInt(process.env.CHECKPOINT_PRUNE_INTERVAL_MS || '60000', 10),
  // CR#2: ticks consecutivos SEM snapshot (bot sem corpo: morte/void) antes de encerrar o loop.
  // Morte/void NÃO emitem 'end', então sem isto o while giraria em falso para sempre. ~20 ticks a
  // 500ms/tick ≈ 10s — tempo para o respawn automático do Mineflayer sem girar indefinidamente.
  deathStopTicks: parseInt(process.env.DEATH_STOP_TICKS || '20', 10),
  // D-17: limiar de trust para pedido-vira-objetivo em ASSISTANT
  trustRequestThreshold: parseFloat(process.env.TRUST_REQUEST_THRESHOLD || '0.0'),
  // D-19: idade máxima (ms) de um goal comprometido antes de ser descartado no boot (decay-on-boot)
  goalStaleMs: parseInt(process.env.GOAL_STALE_MS || String(30 * 60 * 1000), 10),

  // === Fase 6: Provider LLM configurável (cloud/local) ===
  // D-05: default local custo-zero; cloud é opt-in via LLM_PROVIDER=openai
  llmProvider: (process.env.LLM_PROVIDER || 'local') as 'local' | 'openai',
  // D-10: chave da API OpenAI (obrigatória só quando llmProvider=openai)
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  // D-01: modelo cloud = GPT-4.1-mini (família NÃO-reasoning, custo previsível)
  openaiModel: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
  // D-02: max_tokens baixo como corte de custo no caminho cloud
  openaiMaxTokens: parseInt(process.env.OPENAI_MAX_TOKENS || '512', 10),
  // D-04: reasoning.effort SÓ aplicado se o modelo for gpt-5.x/o-series (omitido p/ gpt-4.1-mini)
  openaiReasoningEffort: (process.env.OPENAI_REASONING_EFFORT || 'low') as 'minimal' | 'low' | 'medium' | 'high',
  // D-07: hard-cap de CHAMADAS cloud por janela (default diária). Estourou -> fallback-to-local (D-08).
  cloudMaxCallsPerWindow: parseInt(process.env.LLM_CLOUD_MAX_CALLS_PER_WINDOW || '500', 10),
  // D-09: tamanho da janela em ms (métrica/futuro; o spendStore usa janela por dia-UTC via windowKey)
  cloudWindowMs: parseInt(process.env.LLM_CLOUD_WINDOW_MS || String(24 * 60 * 60 * 1000), 10),
  // D-08: ação ao estourar o teto — única suportada nesta fase é cair para o LM Studio local
  cloudCapAction: (process.env.LLM_CLOUD_CAP_ACTION || 'fallback-local') as 'fallback-local',

  // === Fase 07.1: Loop Agêntico — TriggerBus ===
  // D-14: raio (blocos) para detectar mob hostil no TriggerBus
  hostileRadius: parseInt(process.env.HOSTILE_RADIUS || '16', 10),
  // D-13: debounce (ms) para hostileNearby (evita emissão a cada entityMoved)
  hostileDebounceMs: parseInt(process.env.HOSTILE_DEBOUNCE_MS || '800', 10),
  // D-14: limiar de food para emitir hungry (bot.food <= threshold)
  // D-11: come quando food<=16 (regen para em food<=17; 6 era limiar de sprint, não de saúde)
  hungryThreshold: parseInt(process.env.HUNGRY_THRESHOLD || '16', 10),
  // D-09/D-10: intervalo de wake do park quando genuinamente idle (ms)
  idleWakeIntervalMs: parseInt(process.env.IDLE_WAKE_INTERVAL_MS || '60000', 10),

  // === Fase 8: System 1 — limiares reflexos (D-11..D-14) ===
  // D-11: histerese de fome — para de comer quando food>=18 (regen natural)
  hungerExitThreshold: parseInt(process.env.HUNGER_EXIT_THRESHOLD || '18', 10),
  // D-12: health<=10 dispara reflexo vida-crítica (foge/abriga); exit health>=14
  healthCriticalThreshold: parseInt(process.env.HEALTH_CRITICAL_THRESHOLD || '10', 10),
  healthExitThreshold: parseInt(process.env.HEALTH_EXIT_THRESHOLD || '14', 10),
  // D-14: afogamento — oxygen<=6 emerge (≈4.5s de margem); exit oxygen>=14
  oxygenEmergeThreshold: parseInt(process.env.OXYGEN_EMERGE_THRESHOLD || '6', 10),
  oxygenExitThreshold: parseInt(process.env.OXYGEN_EXIT_THRESHOLD || '14', 10),
  // D-14: queda perigosa só > 3 blocos (dano = blocos-3)
  fallDangerBlocks: parseInt(process.env.FALL_DANGER_BLOCKS || '3', 10),
  // D-14: lookahead de lava à frente, em blocos
  lavaLookahead: parseInt(process.env.LAVA_LOOKAHEAD || '2', 10),
  // D-13: distâncias graduadas de reação a mob hostil por tipo
  creeperReactDistance: parseInt(process.env.CREEPER_REACT_DISTANCE || '10', 10),
  meleeReactDistance: parseInt(process.env.MELEE_REACT_DISTANCE || '8', 10),
  rangedReactDistance: parseInt(process.env.RANGED_REACT_DISTANCE || '16', 10),

  // === Fase 10: Tech Tree DAG + Needs ===
  // D-09: quantidade mínima de cada item da gatheringLadder para considerar "satisfeito" (bridge need→DAG).
  // O agente considera que tem "suficiente" de um item se tiver pelo menos esta quantidade no inventário.
  // Valor baixo (1) garante que a progressão sempre avance para o próximo tier.
  resourceMinQuantity: parseInt(process.env.RESOURCE_MIN_QUANTITY || '1', 10),

  // === Fase 08.1: ChromaDB (vector store HTTP local — índice derivado descartável, D-01/D-03) ===
  chromaHost: process.env.CHROMA_HOST || 'localhost',
  chromaPort: parseInt(process.env.CHROMA_PORT || '8000', 10),
  chromaSsl: (process.env.CHROMA_SSL || 'false') === 'true',
  chromaCollection: process.env.CHROMA_COLLECTION || 'events',
  // Circuit breaker (D-02/D-22) — todos discricionários (timeout curto p/ não pendurar o tick).
  chromaFetchTimeoutMs: parseInt(process.env.CHROMA_FETCH_TIMEOUT_MS || '2000', 10),
  chromaFailThreshold: parseInt(process.env.CHROMA_FAIL_THRESHOLD || '3', 10),
  chromaCooldownMs: parseInt(process.env.CHROMA_COOLDOWN_MS || '30000', 10),
  chromaWarnDebounceMs: parseInt(process.env.CHROMA_WARN_DEBOUNCE_MS || '60000', 10),
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
// 999.1 D-01/D-02: validação de range dos novos raios/timeout
if (config.gatherSearchRadius < 1 || config.gatherSearchRadius > 128) {
  throw new Error(`GATHER_SEARCH_RADIUS inválido: ${config.gatherSearchRadius}. Deve ser entre 1 e 128.`)
}
if (config.pathfinderSearchRadius < 1 || config.pathfinderSearchRadius > 256) {
  throw new Error(`PATHFINDER_SEARCH_RADIUS inválido: ${config.pathfinderSearchRadius}. Deve ser entre 1 e 256.`)
}
if (config.pathfinderThinkTimeoutMs < 1) {
  throw new Error(`PATHFINDER_THINK_TIMEOUT_MS inválido: ${config.pathfinderThinkTimeoutMs}. Deve ser >= 1.`)
}
if (config.gatherReachTimeoutMs < 0) {
  throw new Error(`GATHER_REACH_TIMEOUT_MS inválido: ${config.gatherReachTimeoutMs}. Deve ser >= 0 (0 desativa o pré-check).`)
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
if (config.backoffRecoveryMs < 0) {
  throw new Error(`BACKOFF_RECOVERY_MS inválido: ${config.backoffRecoveryMs}. Deve ser >= 0.`)
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
// Fase 4: validação dos parâmetros de persistência/reflexão
if (config.embeddingDim < 1) throw new Error(`EMBEDDING_DIM inválido: ${config.embeddingDim}. Deve ser >= 1.`)
if (config.ltImportanceFloor < 1 || config.ltImportanceFloor > 10) throw new Error(`LT_IMPORTANCE_FLOOR inválido: ${config.ltImportanceFloor}. Deve estar em [1,10].`)
if (config.retrievalK < 1) throw new Error(`RETRIEVAL_K inválido: ${config.retrievalK}. Deve ser >= 1.`)
if (config.retrievalHalfLifeMs < 1) throw new Error(`RETRIEVAL_HALF_LIFE_MS inválido: ${config.retrievalHalfLifeMs}. Deve ser >= 1.`)
if (config.trustRequestThreshold < -1 || config.trustRequestThreshold > 1) throw new Error(`TRUST_REQUEST_THRESHOLD inválido: ${config.trustRequestThreshold}. Deve estar em [-1,1].`)
if (config.holderFlushIntervalMs < 0) throw new Error(`HOLDER_FLUSH_INTERVAL_MS inválido: ${config.holderFlushIntervalMs}. Deve ser >= 0.`)
// CR#2/CR#3: validação dos parâmetros de ciclo de vida do loop (morte/void + poda do checkpointer)
if (config.checkpointPruneIntervalMs < 0) throw new Error(`CHECKPOINT_PRUNE_INTERVAL_MS inválido: ${config.checkpointPruneIntervalMs}. Deve ser >= 0.`)
if (config.deathStopTicks < 1) throw new Error(`DEATH_STOP_TICKS inválido: ${config.deathStopTicks}. Deve ser >= 1.`)
// Fase 6: validação do provider
if (config.llmProvider !== 'local' && config.llmProvider !== 'openai') {
  throw new Error(`LLM_PROVIDER inválido: ${config.llmProvider}. Deve ser local ou openai.`)
}
if (config.llmProvider === 'openai' && !config.openaiApiKey) {
  throw new Error('LLM_PROVIDER=openai exige OPENAI_API_KEY definido.')
}
if (config.openaiMaxTokens < 1) {
  throw new Error(`OPENAI_MAX_TOKENS inválido: ${config.openaiMaxTokens}. Deve ser >= 1.`)
}
if (config.cloudMaxCallsPerWindow < 1) {
  throw new Error(`LLM_CLOUD_MAX_CALLS_PER_WINDOW inválido: ${config.cloudMaxCallsPerWindow}. Deve ser >= 1.`)
}
if (config.cloudWindowMs < 1) {
  throw new Error(`LLM_CLOUD_WINDOW_MS inválido: ${config.cloudWindowMs}. Deve ser >= 1.`)
}
// Fase 8: validação dos limiares reflexos
if (config.hungryThreshold < 0 || config.hungryThreshold > 20) throw new Error(`HUNGRY_THRESHOLD inválido: ${config.hungryThreshold}. Deve estar em [0,20].`)
if (config.hungerExitThreshold <= config.hungryThreshold || config.hungerExitThreshold > 20) throw new Error(`HUNGER_EXIT_THRESHOLD (${config.hungerExitThreshold}) deve ser > hungryThreshold e <= 20 (histerese).`)
if (config.healthCriticalThreshold < 0 || config.healthCriticalThreshold > 20) throw new Error(`HEALTH_CRITICAL_THRESHOLD inválido: ${config.healthCriticalThreshold}. Deve estar em [0,20].`)
if (config.healthExitThreshold <= config.healthCriticalThreshold || config.healthExitThreshold > 20) throw new Error(`HEALTH_EXIT_THRESHOLD (${config.healthExitThreshold}) deve ser > healthCriticalThreshold e <= 20.`)
if (config.oxygenEmergeThreshold < 0 || config.oxygenEmergeThreshold > 20) throw new Error(`OXYGEN_EMERGE_THRESHOLD inválido: ${config.oxygenEmergeThreshold}. Deve estar em [0,20].`)
if (config.oxygenExitThreshold <= config.oxygenEmergeThreshold || config.oxygenExitThreshold > 20) throw new Error(`OXYGEN_EXIT_THRESHOLD (${config.oxygenExitThreshold}) deve ser > oxygenEmergeThreshold e <= 20.`)
if (config.fallDangerBlocks < 0) throw new Error(`FALL_DANGER_BLOCKS inválido: ${config.fallDangerBlocks}. Deve ser >= 0.`)
if (config.lavaLookahead < 1 || config.lavaLookahead > 8) throw new Error(`LAVA_LOOKAHEAD inválido: ${config.lavaLookahead}. Deve estar em [1,8].`)
for (const [name, v] of [['CREEPER_REACT_DISTANCE', config.creeperReactDistance], ['MELEE_REACT_DISTANCE', config.meleeReactDistance], ['RANGED_REACT_DISTANCE', config.rangedReactDistance]] as const) {
  if (v < 1 || v > 64) throw new Error(`${name} inválido: ${v}. Deve estar em [1,64].`)
}
// Fase 08.1: validação do ChromaDB
if (config.chromaPort < 1 || config.chromaPort > 65535) throw new Error(`CHROMA_PORT inválido: ${config.chromaPort}.`)
if (config.chromaFetchTimeoutMs < 1) throw new Error(`CHROMA_FETCH_TIMEOUT_MS inválido: ${config.chromaFetchTimeoutMs}. Deve ser >= 1.`)
// Fase 9: validação dos timeouts de placement/smelting
if (config.placeTimeoutMs < 1) throw new Error(`PLACE_TIMEOUT_MS inválido: ${config.placeTimeoutMs}. Deve ser >= 1.`)
if (config.placeRetries < 0) throw new Error(`PLACE_RETRIES inválido: ${config.placeRetries}. Deve ser >= 0.`)
if (config.smeltUpdateTimeoutMs < 1) throw new Error(`SMELT_UPDATE_TIMEOUT_MS inválido: ${config.smeltUpdateTimeoutMs}. Deve ser >= 1.`)
if (config.smeltTimeoutMs < 1) throw new Error(`SMELT_TIMEOUT_MS inválido: ${config.smeltTimeoutMs}. Deve ser >= 1.`)
// Fase 10: validação da quantidade mínima de recursos
if (config.resourceMinQuantity < 1) {
  throw new Error(`RESOURCE_MIN_QUANTITY inválido: ${config.resourceMinQuantity}. Deve ser >= 1.`)
}
