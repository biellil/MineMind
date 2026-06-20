// src/perception/types.ts
// Contrato WorldSnapshot — interface PERC-04
// ATENÇÃO: mudanças aqui são breaking changes para as Fases 2, 3 e 4.
// Qualquer alteração deve ser deliberada e documentada em STATE.md.

/** Posição 3D imutável em coordenadas do mundo Minecraft */
export interface Position3D {
  readonly x: number
  readonly y: number
  readonly z: number
}

/** Info de bloco resumida (D-07: não serializa individualmente — apenas tipos relevantes) */
export interface BlockSummary {
  /** Número total de blocos deste tipo encontrados no raio de percepção */
  readonly count: number
  /** Até 3 exemplos de posição para o LLM/loop usar como referência */
  readonly examples: ReadonlyArray<Position3D>
}

/** Slot de inventário completo (D-09) */
export interface InventorySlot {
  readonly slot: number
  readonly name: string
  readonly type: number
  readonly count: number
  readonly metadata: number
  readonly nbt: unknown  // NBT data raw (enchantments etc)
}

/** Entidade no raio de percepção (D-08) */
export interface EntityInfo {
  readonly id: number
  readonly type: string        // 'player' | 'mob' | 'object' | etc
  /** D-14: categoria Mineflayer do mob ('Hostile mobs' | 'Passive mobs' | 'Vehicles' | 'Immobile' | 'Projectiles' | 'UNKNOWN') */
  readonly kind: string
  readonly name: string        // username (player) ou name/type (mob)
  readonly position: Position3D
  readonly distance: number    // metros até o bot
  readonly health: number | null   // null se não disponível via API
  readonly metadata: unknown   // dados extras do protocolo Minecraft
}

/** Bloco diretamente na mira do bot (via bot.blockAtCursor). NOVO — enriquecimento de percepção. */
export interface LookingAtBlock {
  readonly name: string          // ex.: "oak_log", "stone"
  readonly position: Position3D
  readonly distance: number      // metros do bot até o bloco encarado
}

/** Jogador no raio de percepção (D-08) */
export interface PlayerInfo {
  readonly username: string
  readonly displayName: string
  readonly gamemode: number
  readonly ping: number
  readonly position: Position3D | null  // null se entidade não carregada no chunk
  readonly distance: number | null       // null se posição indisponível
}

/** Status do próprio bot (PERC-01) */
export interface BotStatus {
  readonly health: number       // 0–20
  readonly food: number         // 0–20
  readonly position: Position3D
  readonly timeOfDay: number    // 0.0 (meia-noite) a 1.0 (meia-noite seguinte); < 0.5 = dia
  readonly isDay: boolean
}

/**
 * WorldSnapshot — snapshot imutável do estado do mundo (PERC-04)
 *
 * Criado sob demanda por buildWorldSnapshot(bot).
 * A camada cognitiva NUNCA recebe referência ao objeto bot — apenas este snapshot.
 * Todos os campos são readonly; o objeto é também deep-frozen no runtime (D-10).
 */
export interface WorldSnapshot {
  /** Timestamp Unix (ms) do momento da captura */
  readonly capturedAt: number

  /** Status do próprio bot (PERC-01) */
  readonly status: BotStatus

  /** Entidades não-jogadoras no raio de percepção, ordenadas por distância (PERC-02) */
  readonly entities: ReadonlyArray<EntityInfo>

  /** Jogadores no raio de percepção (PERC-02) */
  readonly players: ReadonlyArray<PlayerInfo>

  /**
   * Tipos de bloco encontrados no raio, com contagem e exemplos de posição (PERC-02, D-07)
   * Chave: nome do bloco (ex: "oak_log", "stone", "diamond_ore")
   * Valor: contagem + até 3 posições de exemplo
   */
  readonly nearbyBlockTypes: Readonly<Record<string, BlockSummary>>

  /** Inventário completo slot-a-slot (PERC-03, D-09) */
  readonly inventory: ReadonlyArray<InventorySlot>

  /** Bloco na mira do bot (blockAtCursor); null quando não há bloco no alcance. NOVO. */
  readonly lookingAt: LookingAtBlock | null

  /** Nome do bloco sob os pés do bot (ex.: "air", "water", "stone"); "unknown" se indisponível. NOVO. */
  readonly underfoot: string
}
