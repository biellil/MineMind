// src/cognition/concurrency.ts
// 10.1-01: primitivas de concorrência da deliberação — fundação que o Plan 02 fia no loop.
//
// D-01/D-02/D-03: zero dependências externas (nada de libs de fila/limite/mutex de terceiros).
// Duas primitivas complementares:
//  - Semaphore: teto GLOBAL de inferências LLM concorrentes (dimensionado por provider.maxConcurrency).
//  - createTaskGate: "uma inferência por TIPO" (action/reflection/player) — substitui o inFlight único.
//
// INVARIANTE (Pitfall 3 / D-02): release() é OBRIGATÓRIO no finally de quem fez acquire(), mesmo
// em throw/abort — caso contrário o permit vaza e o semáforo seca (deadlock progressivo).

/** Tipos de tarefa cognitiva que disputam o recurso LLM (prioridade: player < action < reflection). */
export type TaskType = 'action' | 'reflection' | 'player'

/** Waiter enfileirado: prioridade (menor = mais urgente) + o resolver da Promise de acquire. */
type Waiter = { priority: number; resolve: () => void }

/**
 * Semáforo assíncrono com fila ORDENADA por prioridade (D-01/D-02/D-03/D-11).
 *
 * - `acquire(priority)` resolve já se há permit; senão enfileira o waiter em posição ordenada
 *   (menor número de prioridade fura a frente; FIFO entre prioridades iguais).
 * - `release()` passa o permit DIRETO ao próximo waiter (não incrementa quando há fila); só
 *   incrementa `permits` quando a fila está vazia.
 *
 * single-flight emerge de `permits=1`; `permits=2` permite sobreposição real (D-03).
 *
 * Uso obrigatório (Pitfall 3 — evitar permit leak):
 *   await sem.acquire(prio); try { ... } finally { sem.release() }
 */
export class Semaphore {
  private permits: number
  private readonly waiters: Waiter[] = []

  constructor(permits: number) {
    // Guard: permits inválido (0/negativo) viraria um semáforo que nunca libera — normaliza p/ >= 1.
    this.permits = Math.max(1, permits)
  }

  acquire(priority: number): Promise<void> {
    if (this.permits > 0) {
      this.permits--
      return Promise.resolve()
    }
    return new Promise<void>((resolve) => {
      const w: Waiter = { priority, resolve }
      // Inserção ordenada: antes do PRIMEIRO waiter de prioridade ESTRITAMENTE maior.
      // → (a) player(0) fura na frente de reflection(2); (b) FIFO entre mesma prioridade
      //   (não insere antes de um igual, só antes de um pior).
      const idx = this.waiters.findIndex((x) => x.priority > priority)
      if (idx === -1) this.waiters.push(w)
      else this.waiters.splice(idx, 0, w)
    })
  }

  release(): void {
    const next = this.waiters.shift()
    if (next) next.resolve() // permit passa direto ao próximo (não incrementa)
    else this.permits++
  }
}

/**
 * Gate por TIPO de tarefa (D-01/D-12): impede 2 inferências simultâneas do MESMO tipo.
 *
 * O gate por tipo preserva "uma inferência por tipo" (modelo local fraco não ganha em sobrepor
 * dois raciocínios do mesmo tipo); o Semaphore acima impõe o teto GLOBAL de recurso. Os dois
 * trabalham juntos: o gate decide SE um tipo pode disparar; o semáforo decide QUANDO há slot.
 *
 * Substitui o `inFlight: boolean` único da deliberação single-flight por 3 flags independentes.
 */
export function createTaskGate(): {
  tryEnter(t: TaskType): boolean
  leave(t: TaskType): void
  isBusy(t: TaskType): boolean
} {
  const gate: Record<TaskType, boolean> = { action: false, reflection: false, player: false }
  return {
    tryEnter(t: TaskType): boolean {
      if (gate[t]) return false // já ocupado pelo mesmo tipo → não sobrepor (D-01/D-12)
      gate[t] = true
      return true
    },
    leave(t: TaskType): void {
      gate[t] = false
    },
    isBusy(t: TaskType): boolean {
      return gate[t]
    },
  }
}
