// src/skills/blueprints.ts
// Plan 12-01 / Task 1 / D-07/D-09: geradores de blueprint PUROS — funções
// `{tipo, dims, origin} → {pos, bloco}[]` sem bot, sem I/O, sem Math.random/Date.now.
//
// O LLM escolhe tipo/dims/origin; NUNCA coordenadas (LLM=diretor / skill=engenheiro, Fase 9).
// O builder (builder.ts) executa a lista resultante sobre o primitivo robusto placeBlockSafe.
//
// D-09: genShelter ESTENDE a mecânica cavar-e-tampar da Fase 8 (shelter.ts) para os 6 lados —
// gera a CASCA OCA (chão + 4 paredes + teto) ao redor da célula do bot, deixando o miolo vazio.
// O bloco do TETO É parte da casca (Pitfall 1: não excluir — o builder resolve o reach via ordenação).

export type BuildKind = 'shelter' | 'wall' | 'tower'

export interface BuildDims {
  w: number
  h: number
  d: number
}

export interface BuildSpec {
  tipo: BuildKind
  dims: BuildDims
  origin: { x: number; y: number; z: number }
  bloco?: string // default 'cobblestone'
}

export interface BlueprintBlock {
  pos: { x: number; y: number; z: number }
  bloco: string
}

/** Bloco default quando spec.bloco não é fornecido — descartável/comum (mata o "soterrei útil"). */
const DEFAULT_BLOCK = 'cobblestone'

/** Guarda compartilhada: dims com qualquer dimensão <= 0 → blueprint vazio (nunca lança). */
function dimsInvalid(dims: BuildDims): boolean {
  return dims.w <= 0 || dims.h <= 0 || dims.d <= 0
}

/**
 * genShelter (D-09): casca OCA w×h×d ao redor de origin (canto MÍNIMO da caixa). Inclui uma posição
 * apenas se ela está na BORDA da caixa (chão, teto, ou uma das 4 paredes) — o miolo (onde o bot fica)
 * nunca entra na lista. Produz exatamente: fecha os 6 vizinhos da célula central de uma caixa ímpar.
 *
 * Ordem determinística: dy (baixo→cima), dx, dz crescentes.
 */
export function genShelter(spec: BuildSpec): BlueprintBlock[] {
  if (dimsInvalid(spec.dims)) return []
  const { w, h, d } = spec.dims
  const { x: ox, y: oy, z: oz } = spec.origin
  const bloco = spec.bloco ?? DEFAULT_BLOCK
  const out: BlueprintBlock[] = []

  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      for (let dz = 0; dz < d; dz++) {
        const onBorder =
          dx === 0 || dx === w - 1 || dy === 0 || dy === h - 1 || dz === 0 || dz === d - 1
        if (!onBorder) continue // miolo oco — onde o bot fica
        out.push({ pos: { x: ox + dx, y: oy + dy, z: oz + dz }, bloco })
      }
    }
  }
  return out
}

/**
 * genWall: plano vertical w×h ao longo de UM eixo horizontal. Se w >= d varia x (z fixo em origin.z);
 * senão varia z (x fixo em origin.x). h é sempre a altura (y).
 *
 * Ordem determinística: j (altura, baixo→cima), i (largura) crescentes.
 */
export function genWall(spec: BuildSpec): BlueprintBlock[] {
  if (dimsInvalid(spec.dims)) return []
  const { w, h, d } = spec.dims
  const { x: ox, y: oy, z: oz } = spec.origin
  const bloco = spec.bloco ?? DEFAULT_BLOCK
  const out: BlueprintBlock[] = []
  const alongX = w >= d
  const span = alongX ? w : d

  for (let j = 0; j < h; j++) {
    for (let i = 0; i < span; i++) {
      const pos = alongX
        ? { x: ox + i, y: oy + j, z: oz }
        : { x: ox, y: oy + j, z: oz + i }
      out.push({ pos, bloco })
    }
  }
  return out
}

/**
 * genTower: coluna n×n (n = max(1, w)) por h de altura a partir de origin para cima.
 *
 * Ordem determinística: dy (baixo→cima), dx, dz crescentes.
 */
export function genTower(spec: BuildSpec): BlueprintBlock[] {
  if (dimsInvalid(spec.dims)) return []
  const { w, h, d } = spec.dims
  const { x: ox, y: oy, z: oz } = spec.origin
  const bloco = spec.bloco ?? DEFAULT_BLOCK
  const n = Math.max(1, w)
  const out: BlueprintBlock[] = []

  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < n; dx++) {
      for (let dz = 0; dz < n; dz++) {
        out.push({ pos: { x: ox + dx, y: oy + dy, z: oz + dz }, bloco })
      }
    }
  }
  return out
}

/**
 * generateBlueprint: fachada que delega ao gerador correto por `spec.tipo`. Tipo desconhecido → [].
 */
export function generateBlueprint(spec: BuildSpec): BlueprintBlock[] {
  switch (spec.tipo) {
    case 'shelter':
      return genShelter(spec)
    case 'wall':
      return genWall(spec)
    case 'tower':
      return genTower(spec)
    default:
      return []
  }
}
