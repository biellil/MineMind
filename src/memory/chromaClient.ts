// src/memory/chromaClient.ts
// Encapsula o ChromaDB atrás de uma superfície estreita (health/addVector/queryVectors/isAvailable).
//
// Princípios (D-01/D-02/D-03):
// - O Chroma é um ÍNDICE VETORIAL DERIVADO e DESCARTÁVEL — nunca a fonte da verdade (essa é o
//   SQLite relacional). Pode ser apagado/reconstruído sem perda de dados canônicos.
// - O loop cognitivo NUNCA aborta nem pendura por causa do Chroma: TODA chamada passa por um
//   circuit breaker leve + timeout de fetch e DEGRADA para um fallback (void/[]/false) — nunca lança.
// - Embeddings são SEMPRE locais e PRONTOS (PROV-03): este módulo NÃO computa embeddings, só
//   recebe vetores já calculados (LM Studio) e os repassa ao Chroma.
//
// O breaker espelha o padrão `openDb` graceful da persistência, mas para a rede: abre após N
// falhas, fica em cooldown (devolvendo fallback sem chamar a rede), religa sozinho em half-open
// após o cooldown e fecha no primeiro sucesso. Aviso de offline é DEBOUNCED (D-22).
import { ChromaClient, type Collection } from 'chromadb'
import { config } from '../config'
import { EMBEDDING_DIM } from './persistence'

// === Circuit breaker (Pattern 3) — estado puro, relógio injetável p/ testabilidade ===

export type BreakerState = 'closed' | 'open' | 'half-open'

export interface Breaker {
  state: BreakerState
  failures: number
  openedAt: number
  lastWarnAt: number
}

/** Cria um breaker zerado (estado inicial: closed). */
export function createBreaker(): Breaker {
  return { state: 'closed', failures: 0, openedAt: 0, lastWarnAt: 0 }
}

const OFFLINE_MSG =
  "[chroma] OFFLINE — memória vetorial desativada. Inicie 'chroma run' (localhost:8000) para habilitar."

/**
 * Emite o aviso de offline no máximo a cada `chromaWarnDebounceMs` (D-22). `now` é injetável
 * para testar o debounce sem mexer no relógio real. Atualiza `b.lastWarnAt` quando emite.
 */
export function warnOfflineDebounced(b: Breaker, now: number): void {
  if (now - b.lastWarnAt >= config.chromaWarnDebounceMs) {
    b.lastWarnAt = now
    console.warn(OFFLINE_MSG)
  }
}

/**
 * Corta uma promise que pode pendurar em `ms` (Pitfall 5). Como o repasse de AbortSignal pelo
 * cliente Chroma é incerto (Open Question 1 da pesquisa), o `Promise.race` é a GARANTIA do corte
 * independente de o cliente respeitar `signal`. Rejeita com erro de timeout — quem chama (withBreaker)
 * trata como falha.
 */
export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_resolve, reject) =>
      setTimeout(() => reject(new Error(`[chroma] timeout após ${ms}ms`)), ms),
    ),
  ])
}

/**
 * Executa `fn` sob o circuit breaker (Pattern 3). NUNCA propaga exceção — sempre devolve `T` (o
 * resultado de `fn` em sucesso, ou `fallback` em falha/cooldown). `now` é injetável p/ testar
 * cooldown→half-open sem mexer no relógio.
 *
 * - closed: chama `fn`; sucesso → mantém closed e zera failures; falha → incrementa failures e
 *   abre se cruzar `chromaFailThreshold`.
 * - open: durante o cooldown (`chromaCooldownMs`) devolve `fallback` + warn debounced SEM chamar
 *   `fn`; passado o cooldown vira half-open e tenta `fn`.
 * - half-open: sucesso → fecha (failures=0); falha → reabre (openedAt=now).
 */
export async function withBreaker<T>(
  b: Breaker,
  fn: () => Promise<T>,
  fallback: T,
  now: number,
): Promise<T> {
  // Aberto e ainda em cooldown: degrada sem tocar a rede.
  if (b.state === 'open') {
    if (now - b.openedAt < config.chromaCooldownMs) {
      warnOfflineDebounced(b, now)
      return fallback
    }
    // Cooldown expirou: dá uma chance (half-open).
    b.state = 'half-open'
  }

  try {
    const result = await fn()
    // Sucesso: fecha o breaker e zera contadores.
    b.state = 'closed'
    b.failures = 0
    return result
  } catch {
    b.failures += 1
    if (b.state === 'half-open' || b.failures >= config.chromaFailThreshold) {
      b.state = 'open'
      b.openedAt = now
    }
    warnOfflineDebounced(b, now)
    return fallback
  }
}

// === Cliente Chroma (superfície estreita consumida pelos Plans 04/05) ===

export interface ChromaMemoryClient {
  /** Heartbeat sob timeout. true se o Chroma respondeu; false (com warn debounced) caso contrário. */
  health(): Promise<boolean>
  /** Insere/atualiza um vetor PRONTO. No-op silencioso se dim divergir ou o Chroma estiver indisponível. */
  addVector(args: {
    id: number | string
    embedding: number[]
    metadata: Record<string, string | number | boolean>
    document: string
  }): Promise<void>
  /** KNN. Retorna [] em qualquer falha/indisponibilidade. distance = cosine ∈ [0,2]. */
  queryVectors(args: {
    queryEmbedding: number[]
    nResults: number
    player?: string | null
  }): Promise<Array<{ id: string; distance: number }>>
  /** O Plan 04 usa para decidir fallback: false quando o breaker está aberto (Chroma fora). */
  isAvailable(): boolean
}

/**
 * Cria o cliente Chroma encapsulado. O `ChromaClient` e a `Collection` são memoizados
 * preguiçosamente (criados na 1ª chamada bem-sucedida). Todo acesso passa por withBreaker+timeout.
 */
export function createChromaClient(): ChromaMemoryClient {
  const breaker = createBreaker()
  let client: ChromaClient | null = null
  let collection: Collection | null = null

  /** Lazy: instancia o ChromaClient 1x (sem rede — só constrói o objeto). */
  function getClient(): ChromaClient {
    if (!client) {
      client = new ChromaClient({ host: config.chromaHost, port: config.chromaPort, ssl: config.chromaSsl })
    }
    return client
  }

  /**
   * get-or-create da collection (D-23/D-03/D-05). Memoiza. Envolto em withBreaker (fallback null).
   * - embeddingFunction: null → bring-your-own embeddings (D-03), o Chroma não computa nada.
   * - configuration.hnsw.space cosine (D-05) — o DEFAULT do Chroma é l2; esquecer = scoring errado.
   * Se devolver null, os métodos add/query degradam para no-op/[].
   */
  async function ensureCollection(now: number): Promise<Collection | null> {
    if (collection) return collection
    const c = await withBreaker<Collection | null>(
      breaker,
      () =>
        withTimeout(
          getClient().getOrCreateCollection({
            name: config.chromaCollection,
            embeddingFunction: null,
            configuration: { hnsw: { space: 'cosine' } },
          }),
          config.chromaFetchTimeoutMs,
        ),
      null,
      now,
    )
    if (c) collection = c
    return c
  }

  return {
    async health(): Promise<boolean> {
      const now = Date.now()
      return withBreaker(
        breaker,
        async () => {
          await withTimeout(getClient().heartbeat(), config.chromaFetchTimeoutMs)
          return true
        },
        false,
        now,
      )
    },

    async addVector({ id, embedding, metadata, document }): Promise<void> {
      // Pitfall 2: dimensão divergente corromperia o índice — loga e no-op (não conta como falha de rede).
      if (embedding.length !== EMBEDDING_DIM) {
        console.warn(`[chroma] addVector ignorado: dim ${embedding.length} != EMBEDDING_DIM ${EMBEDDING_DIM}`)
        return
      }
      const now = Date.now()
      const col = await ensureCollection(now)
      if (!col) return // Chroma indisponível — degrada silencioso (já houve warn debounced no breaker).
      await withBreaker<void>(
        breaker,
        () =>
          // Pitfall 6: ids são STRING; embeddings number[][]; metadatas plano; documents o resumo.
          withTimeout(
            col.add({
              ids: [String(id)],
              embeddings: [embedding],
              metadatas: [metadata],
              documents: [document],
            }),
            config.chromaFetchTimeoutMs,
          ),
        undefined,
        now,
      )
    },

    async queryVectors({ queryEmbedding, nResults, player }): Promise<Array<{ id: string; distance: number }>> {
      if (queryEmbedding.length !== EMBEDDING_DIM) {
        console.warn(`[chroma] queryVectors ignorado: dim ${queryEmbedding.length} != EMBEDDING_DIM ${EMBEDDING_DIM}`)
        return []
      }
      const now = Date.now()
      const col = await ensureCollection(now)
      if (!col) return []
      return withBreaker<Array<{ id: string; distance: number }>>(
        breaker,
        async () => {
          // Retorno DOUBLE-NESTED por query na v3: res.ids[0], res.distances[0].
          const res = await withTimeout(
            col.query({
              queryEmbeddings: [queryEmbedding],
              nResults,
              where: player ? { player: { $eq: player } } : undefined,
            }),
            config.chromaFetchTimeoutMs,
          )
          const ids = (res.ids[0] ?? []) as string[]
          const distances = (res.distances?.[0] ?? []) as number[]
          return ids.map((id, i) => ({ id, distance: distances[i] ?? 0 }))
        },
        [],
        now,
      )
    },

    isAvailable(): boolean {
      // open = Chroma fora; closed/half-open = vale a pena tentar.
      return breaker.state !== 'open'
    },
  }
}
