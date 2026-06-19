# Phase 2: Loop Autônomo e Memória de Curto Prazo - Research

**Researched:** 2026-06-18
**Domain:** Orquestração de loop cognitivo cíclico com `@langchain/langgraph` (JS) sob Bun, sem LLM
**Confidence:** HIGH (API LangGraph verificada por runtime-test sob Bun; versões verificadas no npm)

## Summary

Esta fase implementa o loop cognitivo como um `StateGraph` do LangGraph JS rodando **continuamente via um driver externo** (um `while`/`setTimeout` no TypeScript que chama `graph.invoke()` uma vez por tick), e **NÃO** como um ciclo interno do grafo. Esta é a descoberta mais importante da pesquisa: o LangGraph tem um `recursionLimit` padrão de 25 que **lança `GraphRecursionError`** assim que um grafo com aresta de retorno própria (`addEdge("inc","inc")`) atinge 25 super-steps. Confirmei isso por runtime-test. Portanto a "aresta de retorno" do roadmap (D-01) é satisfeita pelo **driver externo que re-invoca o grafo**, com cada tick sendo um grafo curto e finito (Observe → ... → Execute → END). Isso casa perfeitamente com a cadência single-flight bloqueante da D-02 (uma volta → no máximo uma skill via `executeWithSafety` → aguarda → intervalo mínimo ~500ms).

**Correção crítica de stack:** O `research/STACK.md` (e a CLAUDE.md) afirmam `@langchain/langgraph` **0.4.x**. Isso está **desatualizado**. O `latest` no npm é **1.4.4** (publicado 2026-06-17, um dia antes desta pesquisa), com a linha 0.4.x congelada em 0.4.9. A 1.x é estável e mudou os peers: agora exige `@langchain/core ^1.1.48` e aceita `zod ^3.25.32 || ^4.2.0` (o projeto tem zod 4.4.3 ✓). Recomendo instalar a **1.x estável** (`@langchain/langgraph@1` + `@langchain/core@1`), não a 0.4.x do STACK.md. A API de `Annotation.Root`/`StateGraph` que importa para esta fase é idêntica entre 0.4 e 1.x — verifiquei a 1.4.4 funcionando sob Bun 1.3.2.

**`MemorySaver` (D-03)** é re-exportado de `@langchain/langgraph` (vem transitivamente de `@langchain/langgraph-checkpoint`), é **JS puro, sem node-gyp/NAPI**, e instalou + rodou limpo sob Bun. `better-sqlite3`/`SqliteSaver` permanecem proibidos (D-02 da Fase 1) — e nem são necessários aqui.

**Primary recommendation:** Driver externo single-flight chamando `graph.invoke(snapshotInput, { configurable: { thread_id } })` por tick; grafo curto e finito por tick (Observe→Analyze→UpdateMemory→Decide→Plan→Execute→END); `MemorySaver` como checkpointer; estado cognitivo + modo de controle + ring buffer vivendo no estado anotado e/ou em estruturas próprias fora do `bot`. Instalar LangGraph **1.x**, não 0.4.x.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Arquitetura do Loop (COG-01)**
- **D-01:** O loop é um `StateGraph` do LangGraph (JS) com aresta de retorno (locked). Nós seguem Observe → Analyze → Update Memory → (Evaluate/Decide por regra fixa) → Plan → Execute → repete. **Sem LLM em nenhum nó.**
- **D-02:** **Cadência: tick fixo single-flight, bloqueante na skill.** O grafo roda uma volta, dispara **no máximo uma** skill e **aguarda ela concluir** (via `executeWithSafety`) antes do próximo tick. Intervalo mínimo configurável entre voltas (sugestão ~500ms). Single-flight natural; prepara as "duas taxas" da Fase 3 sem implementá-las.
- **D-03:** **Checkpointer: `MemorySaver` (em memória).** Sem disco, sem `better-sqlite3`. Estado reinicia do zero a cada start — aceitável (persistência real é Fase 4). NÃO antecipar `bun:sqlite`.
- **D-04:** O loop opera exclusivamente sobre o `WorldSnapshot` imutável — nunca recebe referência ao `bot` (carrega D-10 da Fase 1). Skills executadas por nome via `skillRegistry`.

**Estados Cognitivos e Transição (COG-02)**
- **D-05:** **Arbitragem por prioridade fixa**, de cima para baixo: `Socializing` (jogador próximo) > `Gathering` (alvo de coleta no raio) > `Exploring` (caso contrário) > `Idle` (fallback). Determinístico.
- **D-06:** Implementar como nós/ramos: **Idle, Exploring, Gathering, Socializing**. **Fighting e Building como stub** (entram no enum/máquina, retornam imediatamente — espelha stubs `follow`/`attack` da Fase 1).
- **D-07:** **Gathering por escada de prioridade de sobrevivência, configurável.** Objetivo: sobreviver e ficar mais forte. Lista priorizada de tipos de bloco-alvo em config (ex.: madeira → ferramentas → pedra → minérios; comida quando faminto). Coleta o alvo de maior prioridade presente em `snapshot.nearbyBlockTypes`. **Escada de regra fixa, NÃO necessidades que decaem nem objetivos dinâmicos (esses são Fase 3).**

**Modo de Controle por Comando de Chat**
- **D-08:** **Máquina de modo de controle** sobre os estados cognitivos: **Autônomo** (padrão), **Pausado** (parado, não age), **Standby** (vem para perto de um jogador e aguarda, sem agir autonomamente).
- **D-09:** Gatilho = **parser de comando literal no chat** (palavra-chave exata, **sem LLM** — ex.: `!pausar`→Pausado; `!vem`/`!aqui`→Standby; `!livre`→Autônomo). Palavras exatas a critério do planner. **Escopo:** apenas comando literal → ação. Conversa coerente continua Fase 3 (CHAT-01).

**Anti-Repetição e Robustez (COG-04)**
- **D-10:** **Rede de segurança mínima** (não comprometimento/histerese pesado). Detecta mesma ação repetida N vezes **sem progresso** e força abandonar/cair para Idle. Comprometimento rico fica para Fase 3.
- **D-11:** **Backoff leve** em falha de skill (timeout/stuck). Marca alvo como "falho" com cooldown curto, incrementa contador, escolhe outro alvo/estado; após M falhas consecutivas cai para Idle. Reutiliza `SkillTimeoutError`/`SkillStuckError`.

**Memória de Curto Prazo (MEM-01)**
- **D-12:** **Ring buffer de eventos ricos.** Grava: transições de estado, ações executadas + resultado (sucesso/falha), eventos do mundo relevantes (dano, fome, jogador chegou/saiu), comandos de chat. Cada entrada com **timestamp e tipo** discriminado. Contrato rico que a Fase 3 (LLM) consome como contexto.
- **D-13:** **Evicção por orçamento de tokens desde já.** Buffer limitado por orçamento de tokens **estimado** (heurística ~4 chars/token sobre o texto serializado de cada entrada), evicção **FIFO** ao estourar. Esqueleto pronto para a Fase 3 plugar o tokenizer real.

### Claude's Discretion
- Valor exato do intervalo mínimo entre ticks (sugestão ~500ms) e timeouts por estado.
- Palavras-chave exatas dos comandos de chat (`!pausar`, `!vem`, `!livre` ou similares).
- Valores de N (repetições antes de abandonar), M (falhas antes de Idle), orçamento de tokens padrão.
- Taxonomia exata dos tipos de evento da memória e formato de serialização para estimativa de tokens.
- Estratégia de logging/observabilidade do loop (console de transições — Critério #2).
- Estrutura de diretórios dos novos módulos (sugestão: `src/cognition/` para o grafo, `src/memory/` para o ring buffer).

### Deferred Ideas (OUT OF SCOPE)
- **Conversa coerente com jogadores (CHAT-01):** Fase 3. Aqui só comando literal.
- **Necessidades que decaem + objetivos dinâmicos com histerese (NEED/GOAL):** Fase 3.
- **Arquitetura de duas taxas + LLM single-flight (COG-03):** Fase 3. A Fase 2 usa tick único single-flight bloqueante (D-02).
- **Persistência durável + sobrevivência a reinício/reconexão (MEM-02/03, CONN-03):** Fase 3/4. MemorySaver em memória por ora.
- **Qualquer chamada a LLM, deliberação ou conversa coerente:** Fase 3.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| COG-01 | Loop cognitivo cíclico funciona (Observe → Analyze → Update Memory → … → Execute → repete) | Padrão "driver externo + grafo finito por tick" (Architecture Pattern 1). `StateGraph`/`Annotation.Root` API verificada por runtime-test. recursionLimit obriga grafo finito por tick — driver externo fornece o "repete". |
| COG-02 | Estados cognitivos (Idle, Exploring, Gathering, Socializing; Fighting/Building stub) | Arbitragem por prioridade fixa num nó `decide` + `addConditionalEdges` roteando para o nó do estado (Pattern 2). Stubs espelham `follow`/`attack`. |
| COG-04 | Detecta repetição de ações e ausência de progresso, evita oscilar/travar | Rede anti-repetição (D-10) + backoff (D-11) implementados em estado anotado (contadores) lendo `SkillTimeoutError`/`SkillStuckError` do executor. Don't-Hand-Roll: reusa o executor, não recriar watchdog. |
| MEM-01 | Memória de curto prazo (buffer limitado) com orçamento de tokens | Ring buffer com evicção FIFO por orçamento de tokens estimado (~4 chars/token). Pattern 4 + design pattern documentado. Esqueleto plugável para tokenizer real na Fase 3. |
</phase_requirements>

## Standard Stack

### Core (a INSTALAR — ainda não no package.json)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@langchain/langgraph` | **^1.4.4** (latest) | Orquestração do loop cognitivo como `StateGraph` | Framework TS padrão para grafos de agente stateful/cíclicos. `Annotation`/`StateGraph`/`MemorySaver` é a API canônica. `[VERIFIED: npm view, latest=1.4.4 publicado 2026-06-17]` |
| `@langchain/core` | **^1.2.0** | Abstrações core (peer obrigatório de langgraph) | Peer dependency exigida: `@langchain/core ^1.1.48`. `[VERIFIED: npm view @langchain/langgraph@1.4.4 peerDependencies]` |

> **ATENÇÃO PLANNER — divergência do STACK.md:** O `research/STACK.md` e a `CLAUDE.md` dizem `@langchain/langgraph 0.4.x`. Isso está **DESATUALIZADO** — escrito quando 0.4.x era o latest. Hoje (2026-06-18) o **latest é 1.4.4** e a 0.4.x parou em 0.4.9. A 1.x é estável. A API que esta fase usa (`Annotation.Root`, `StateGraph`, `addNode/addEdge/addConditionalEdges`, `MemorySaver`, `START`/`END`) é a mesma. **Recomendo instalar a 1.x.** Se o planner preferir aderir literalmente ao STACK.md com 0.4.9, funciona também (mesma API), mas perde correções e fica numa linha congelada — e exigiria `@langchain/core 0.x`, divergindo dos peers atuais. `[VERIFIED: npm — 0.4.x maxes at 0.4.9; 1.4.4 latest]`

**Nenhuma biblioteca nova além dessas duas.** O ring buffer, a máquina de estados, o parser de comando e o backoff são código próprio (TypeScript puro) — ver "Don't Hand-Roll" para o que NÃO recriar.

### Supporting (já no projeto — reusar sem modificar)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `mineflayer` | 4.37.1 | `bot.on('chat', ...)` para o parser de comando (D-09); `buildWorldSnapshot(bot)` no Observe | Já instalado. Único acoplamento novo ao `bot` é o handler de chat — isolar num módulo de controle. |
| `zod` | 4.4.3 | Já usado pelos schemas das skills (Fase 1) | Não precisa schema novo nesta fase (estado interno é TS puro). Compatível com peer do langgraph (`zod ^4.2.0`). `[VERIFIED]` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Driver externo (`while`+invoke por tick) | Ciclo interno do grafo (`addEdge("execute","observe")`) | **REJEITADO:** dispara `GraphRecursionError` aos 25 ticks (verificado por runtime-test). Subir `recursionLimit` para Infinity é possível mas: (a) perde o limite de segurança que pega loops travados, (b) acumula o histórico inteiro de checkpoints numa única invocação, (c) não dá ponto natural para o intervalo single-flight da D-02. Driver externo é o padrão correto e idiomático para agentes always-on. |
| `MemorySaver` | `SqliteSaver` (`@langchain/langgraph-checkpoint-sqlite`) | **PROIBIDO (D-03 + D-02 Fase 1):** usa `better-sqlite3` (NAPI/node-gyp), não suportado no Bun. E persistência durável é deliberadamente Fase 4. |
| `@langchain/langgraph` 1.x | 0.4.9 | 0.4.9 funciona (mesma API), mas é linha congelada e exige `@langchain/core 0.x`. 1.x é o estável atual. |

**Installation:**
```bash
bun add @langchain/langgraph @langchain/core
```
`[VERIFIED: rodado em /tmp sob Bun 1.3.2 — "22 packages installed", JS puro, sem erros NAPI]`

**Version verification (rodado 2026-06-18):**
- `@langchain/langgraph` latest = **1.4.4** (publish 2026-06-17T23:43Z) `[VERIFIED: npm view]`
- `@langchain/core` latest = **1.2.0** `[VERIFIED: npm view]`
- peers de 1.4.4: `@langchain/core ^1.1.48`, `zod ^3.25.32 || ^4.2.0`, `zod-to-json-schema ^3.x` `[VERIFIED]`
- `MemorySaver` vem transitivamente de `@langchain/langgraph-checkpoint ^1.1.2` mas é **re-exportado** de `@langchain/langgraph` — importar do pacote principal. `[VERIFIED: runtime import]`

## Architecture Patterns

### Recommended Project Structure (Claude's discretion — D-discretion)
```
src/
├── cognition/
│   ├── graph.ts          # define o StateGraph + Annotation.Root (estado do loop)
│   ├── nodes.ts          # nós: observe, analyze, updateMemory, decide, plan, execute
│   ├── arbiter.ts        # arbitragem por prioridade fixa (D-05) + escada de Gathering (D-07)
│   ├── states.ts         # enum CognitiveState (Idle/Exploring/Gathering/Socializing/Fighting/Building)
│   ├── safety.ts         # anti-repetição (D-10) + backoff de falha (D-11)
│   └── loop.ts           # startCognitiveLoop(bot): driver externo single-flight
├── control/
│   └── commands.ts       # parser literal bot.on('chat') → modo (Autônomo/Pausado/Standby) (D-08/D-09)
├── memory/
│   └── shortTerm.ts      # ring buffer rico + evicção por orçamento de tokens (D-12/D-13)
└── cognition/config.ts   # ou estender src/config.ts: minTickMs, gatheringLadder, N, M, tokenBudget
```
> `src/bot/index.ts` → `onBotReady(bot)` passa a chamar `startCognitiveLoop(bot)` no lugar da demo da Fase 1.

### Pattern 1: Driver externo single-flight (COG-01 + D-01 + D-02) — O PADRÃO CENTRAL
**What:** O grafo é curto e finito (termina em `END` a cada tick). Um loop TypeScript externo o re-invoca por tick, aguardando a conclusão (inclusive a skill bloqueante) antes do próximo, com intervalo mínimo. A "aresta de retorno" da D-01 = o driver re-invocando.
**When to use:** Sempre — é a forma idiomática de rodar um agente always-on no LangGraph JS sem estourar `recursionLimit`.
**Example (verificado por runtime-test sob Bun 1.3.2):**
```typescript
// Source: API verificada em runtime — @langchain/langgraph@1.4.4 + @langchain/core@1.2.0 sob Bun 1.3.2
import { StateGraph, Annotation, START, END, MemorySaver } from "@langchain/langgraph"

// Estado anotado do loop (D-03/D-12). reducer:(_,b)=>b = "substitui"; default = valor inicial.
const LoopState = Annotation.Root({
  snapshot:   Annotation<WorldSnapshot | null>({ reducer: (_, b) => b, default: () => null }),
  mode:       Annotation<ControlMode>({ reducer: (_, b) => b, default: () => "autonomous" }),
  cogState:   Annotation<CognitiveState>({ reducer: (_, b) => b, default: () => "idle" }),
  memory:     Annotation<ShortTermMemory>({ reducer: (_, b) => b, default: () => createMemory() }),
  // contadores anti-repetição / backoff (D-10/D-11)
  repeatCount: Annotation<number>({ reducer: (_, b) => b, default: () => 0 }),
})

const graph = new StateGraph(LoopState)
  .addNode("observe", observeNode)      // chama buildWorldSnapshot(bot) — bot via closure, NÃO no estado
  .addNode("analyze", analyzeNode)
  .addNode("updateMemory", updateMemoryNode)
  .addNode("decide", decideNode)        // arbitragem D-05 + escada Gathering D-07
  .addNode("execute", executeNode)      // chama 1 skill via executeWithSafety (D-02)
  .addEdge(START, "observe")
  .addEdge("observe", "analyze")
  .addEdge("analyze", "updateMemory")
  .addEdge("updateMemory", "decide")
  .addEdge("decide", "execute")
  .addEdge("execute", END)              // FINITO por tick — driver externo fecha o ciclo
  .compile({ checkpointer: new MemorySaver() })

export async function startCognitiveLoop(bot: Bot): Promise<void> {
  const cfg = { configurable: { thread_id: "minemind-agent" } }
  while (botStillConnected(bot)) {
    const started = Date.now()
    await graph.invoke({}, cfg)         // estado persiste via thread_id entre ticks
    const elapsed = Date.now() - started
    if (elapsed < MIN_TICK_MS) await sleep(MIN_TICK_MS - elapsed) // D-02 intervalo mínimo
  }
}
```
> **Por que `await graph.invoke({}, cfg)` com input vazio funciona:** o `MemorySaver` + `thread_id` carregam o estado do tick anterior; cada nó retorna apenas o delta. Verifiquei que o estado acumula corretamente entre invocações sucessivas (mesmo `thread_id`).

### Pattern 2: Arbitragem por prioridade + conditional edges (COG-02 + D-05/D-06)
**What:** Um nó `decide` calcula o estado cognitivo por prioridade fixa lendo o snapshot; `addConditionalEdges` roteia para o nó do estado. Alternativamente (mais simples), `decide` grava `cogState` e `execute` faz `switch(cogState)` — menos nós, mais fácil de depurar para uma espinha sem-LLM.
**When to use:** Conditional edges quando cada estado tem lógica de nó distinta; `switch` em `execute` quando os estados são pequenos. Recomendo o **switch** para a Fase 2 (menos superfície, mais legível) e migrar para conditional edges na Fase 3 se necessário.
**Example (conditional edges — verificado por runtime-test):**
```typescript
// Source: runtime-test @langchain/langgraph@1.4.4
.addConditionalEdges("decide", (s) => s.cogState, {
  socializing: "socializingNode",
  gathering:   "gatheringNode",
  exploring:   "exploringNode",
  idle:        "idleNode",
  fighting:    "stubNode",  // D-06 stub
  building:    "stubNode",  // D-06 stub
})
```
Arbitragem (D-05), regra fixa pura sobre o snapshot:
```typescript
function arbitrate(s: WorldSnapshot, mode: ControlMode): CognitiveState {
  if (mode === "paused")  return "idle"        // modo de controle vence (D-08)
  if (mode === "standby") return "socializing" // vem para perto, aguarda
  if (s.players.some(p => (p.distance ?? Infinity) <= SOCIAL_RADIUS)) return "socializing"
  if (highestPriorityGatherTarget(s.nearbyBlockTypes)) return "gathering" // escada D-07
  return "exploring" // fallback antes de idle; idle só se exploring falhar repetidamente
}
```

### Pattern 3: Modo de controle por chat literal (D-08/D-09)
**What:** Handler `bot.on('chat', (username, message) => ...)` mapeia palavra-chave exata → mudança de modo. Único acoplamento novo ao `bot` além do Observe — isolar em `src/control/`.
**When to use:** Registrar uma vez em `startCognitiveLoop` (ou `onBotReady`). O modo vive fora do `bot` (numa ref compartilhada lida pelo nó `decide`).
**Example:**
```typescript
const COMMANDS: Record<string, ControlMode> = {
  "!pausar": "paused", "!vem": "standby", "!aqui": "standby", "!livre": "autonomous",
}
bot.on("chat", (username, message) => {
  if (username === bot.username) return                  // ignora a si mesmo
  const mode = COMMANDS[message.trim().toLowerCase()]
  if (mode) controlState.setMode(mode)                   // sem LLM — match literal
})
```

### Pattern 4: Ring buffer com orçamento de tokens (MEM-01 + D-12/D-13)
**What:** Array de eventos discriminados (`{ type, timestamp, ...payload }`); ao inserir, estima tokens (`Math.ceil(serialized.length / 4)`), soma ao total, e faz `shift()` FIFO enquanto o total exceder o orçamento.
**When to use:** O nó `updateMemory` grava transições/ações/eventos/comandos.
**Example:**
```typescript
type MemEvent =
  | { type: "state_transition"; from: CognitiveState; to: CognitiveState; timestamp: number }
  | { type: "action"; skill: string; params: unknown; result: "success" | "failure"; reason?: string; timestamp: number }
  | { type: "world"; event: "damage" | "hunger" | "player_joined" | "player_left"; detail: string; timestamp: number }
  | { type: "chat_command"; command: string; from: string; timestamp: number }

const estimateTokens = (e: MemEvent) => Math.ceil(JSON.stringify(e).length / 4) // ~4 chars/token (D-13)

function push(buf: MemEvent[], e: MemEvent, budget: number): MemEvent[] {
  const next = [...buf, e]
  let total = next.reduce((sum, x) => sum + estimateTokens(x), 0)
  while (total > budget && next.length > 0) { total -= estimateTokens(next.shift()!) } // FIFO
  return next
}
```
> Fase 3 troca `estimateTokens` por um tokenizer real (`js-tiktoken` já é peer transitivo de `@langchain/core`, ou o tokenizer do modelo LM Studio). O esqueleto não muda — só a função de contagem. `[VERIFIED: js-tiktoken em peerDeps de @langchain/core@1.2.0]`

### Anti-Patterns to Avoid
- **Ciclo interno infinito no grafo (`addEdge("execute","observe")`):** lança `GraphRecursionError` aos 25 super-steps. `[VERIFIED: runtime-test — "Recursion limit of 25 reached"]`. Use driver externo.
- **`recursionLimit: Infinity` para forçar loop interno:** perde o detector de loop travado e acumula checkpoints sem fim numa única invocação. Anti-idiomático.
- **Passar `bot` dentro do estado anotado do grafo:** quebra a imutabilidade D-04/D-10 e o `MemorySaver` tentaria serializá-lo. Passe `bot` por **closure** para os nós; o estado carrega só o `WorldSnapshot` e dados puros.
- **Recriar timeout/watchdog dentro de um nó:** o `executeWithSafety` já faz isso (ACT-03). O nó `execute` só o chama.
- **Disparar mais de uma skill por tick:** viola single-flight (D-02). Um tick = no máximo uma skill, aguardada.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Timeout + watchdog de "sem progresso" da skill | Novo `Promise.race`/`setInterval` num nó | `executeWithSafety` (`src/skills/executor.ts`) | Já existe, testado na Fase 1; lança `SkillTimeoutError`/`SkillStuckError` que o backoff (D-11) consome. |
| Persistência de estado entre ticks | `Map`/variável global manual | `MemorySaver` + `thread_id` do LangGraph | É a primitiva de checkpoint do framework; verifiquei acúmulo correto entre invocações. |
| Captura do mundo | Ler `bot.entities`/`bot.blockAt` no nó | `buildWorldSnapshot(bot)` (`src/perception/snapshot.ts`) | Contrato imutável D-04/D-10; o nó Observe só o chama. |
| Schemas de skill | Redefinir args | `skillRegistry` + `toolRegistry` (`src/skills/index.ts`) | Já prontos (Zod) da Fase 1. |
| Ciclo do grafo / roteamento | Máquina de estados ad-hoc paralela ao grafo | `StateGraph` + `addConditionalEdges` | É o ponto do LangGraph (D-01). |

**Key insight:** A Fase 2 é majoritariamente **fiação de assets existentes dentro do esqueleto do LangGraph** + três peças de lógica nova e pequena (arbitragem, ring buffer, parser de comando). O risco não está em construir muito, e sim em **recriar** o que a Fase 1 já entregou.

## Common Pitfalls

### Pitfall 1: recursionLimit mata o loop "infinito"
**What goes wrong:** Modelar a aresta de retorno como ciclo interno do grafo → `GraphRecursionError` aos 25 ticks.
**Why it happens:** `recursionLimit` (padrão 25) conta super-steps **por invocação**. Um grafo que nunca chega a `END` numa invocação estoura.
**How to avoid:** Driver externo (Pattern 1). Cada `invoke` é um grafo finito (termina em `END`); o contador de recursão reseta a cada tick. `[VERIFIED: runtime-test — driver externo correu 3 ticks acumulando estado sem erro; self-loop estourou aos 25]`
**Warning signs:** `GraphRecursionError`/`GRAPH_RECURSION_LIMIT` no log já no início.

### Pitfall 2: STACK.md/CLAUDE.md desatualizados (0.4.x vs 1.x)
**What goes wrong:** Planner fixa `@langchain/langgraph@0.4.x` e `@langchain/core@0.x` conforme STACK.md → linha congelada e peers divergentes.
**Why it happens:** STACK.md foi escrito quando 0.4.x era latest; a 1.x estável saiu desde então (1.4.4 em 2026-06-17).
**How to avoid:** Instalar `@langchain/langgraph@^1` + `@langchain/core@^1`. A API desta fase é idêntica. `[VERIFIED: npm dist-tags latest=1.4.4]`
**Warning signs:** Conflito de peer dep no `bun add` (core 0.x vs langgraph 1.x exigindo core ^1.1.48).

### Pitfall 3: Serializar o `bot` via estado anotado
**What goes wrong:** Colocar `bot` (ou objetos Mineflayer vivos) no estado → o `MemorySaver` tenta clonar/serializar referências circulares, e quebra a imutabilidade D-04/D-10.
**How to avoid:** `bot` chega aos nós por **closure**; o estado anotado carrega só `WorldSnapshot` (já deep-frozen) e tipos puros.
**Warning signs:** Erros de serialização no checkpointer; mutações inesperadas no snapshot.

### Pitfall 4: Oscilação de estado / repetição sem progresso (COG-04)
**What goes wrong:** Sem a rede D-10, o agente alterna Exploring↔Gathering ou martela o mesmo bloco inalcançável.
**How to avoid:** Contador de repetição no estado anotado: se a mesma (ação, alvo) repetir N vezes sem mudança no snapshot relevante (ex.: contagem do bloco-alvo não cai, posição não muda), abandona o alvo e tenta outro/Idle. Backoff (D-11): após `SkillTimeoutError`/`SkillStuckError`, marca o alvo com cooldown curto; após M falhas consecutivas, cai para Idle. `[ASSUMED — valores N/M são Claude's discretion; sugestão de partida N=3, M=3]`
**Warning signs:** Logs repetindo a mesma transição/skill indefinidamente.

### Pitfall 5: chat handler reagindo às próprias mensagens / múltiplos registros
**What goes wrong:** Registrar `bot.on('chat')` a cada reconexão acumula handlers; ou o bot reage ao próprio username.
**How to avoid:** Ignorar `username === bot.username`; registrar o handler uma vez por sessão de bot (a Fase 1 cria sessão limpa na reconexão — registrar dentro de `onBotReady`, que já roda por sessão). `[ASSUMED — confirmar com o fluxo de reconexão da Fase 1 em src/bot/connection.ts]`

## Code Examples

Os exemplos verificados estão em "Architecture Patterns" (Patterns 1–4). Resumo das primitivas LangGraph confirmadas por runtime-test sob Bun 1.3.2:

```typescript
// Source: runtime-test @langchain/langgraph@1.4.4 + @langchain/core@1.2.0, Bun 1.3.2 — 2026-06-18
import { StateGraph, Annotation, START, END, MemorySaver } from "@langchain/langgraph"
// START === "__start__", END === "__end__"  [VERIFIED por console.log]
// Annotation.Root({ field: Annotation<T>({ reducer, default }) })  — reducer:(prev,upd)=>next
// new StateGraph(AnnotationRoot).addNode(name, fn).addEdge(a,b).addConditionalEdges(src, routerFn, map).compile({ checkpointer })
// graph.invoke(inputDelta, { configurable: { thread_id } })  — estado persiste por thread_id
// new MemorySaver()  — JS puro, sem NAPI, Bun-safe  [VERIFIED]
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `@langchain/langgraph` 0.4.x (STACK.md) | **1.x estável** (latest 1.4.4) | 1.x estabilizou; 1.4.4 em 2026-06-17 | Instalar 1.x; ajustar peer para `@langchain/core ^1` |
| Estimativa de tokens por heurística (Fase 2) | Tokenizer real do modelo (Fase 3) | Planejado p/ Fase 3 | Trocar só `estimateTokens`; `js-tiktoken` já disponível via core |

**Deprecated/outdated:**
- `@langchain/langgraph 0.4.x` como alvo: não deprecado, mas **superado** pela 1.x estável. STACK.md desatualizado neste ponto.
- `SqliteSaver`/`better-sqlite3`: proibido sob Bun (D-02 Fase 1) — não usar nesta fase de qualquer modo (D-03).

## Runtime State Inventory

> Não é uma fase de rename/refactor/migração — esta seção não se aplica.
> **None — fase greenfield de novos módulos cognitivos; nenhum estado runtime pré-existente a migrar.** O único estado vivo é em memória (`MemorySaver`), descartado a cada start por decisão de design (D-03).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Valores de partida N=3 (repetições) e M=3 (falhas) para anti-repetição/backoff | Pitfall 4 / D-10/D-11 | Baixo — Claude's discretion; ajustável sem reescrita. |
| A2 | Registrar `bot.on('chat')` dentro de `onBotReady` cobre a reconexão sem acumular handlers | Pitfall 5 | Médio — depende do fluxo de reconexão da Fase 1; **planner deve ler `src/bot/connection.ts`** para confirmar que cada reconexão cria sessão de bot nova (e portanto novo `onBotReady`). |
| A3 | Heurística ~4 chars/token é placeholder adequado até o tokenizer real (Fase 3) | Pattern 4 / D-13 | Baixo — é literalmente o que a D-13 pede; só afeta precisão da evicção, não corretude. |
| A4 | `switch(cogState)` no nó execute é preferível a conditional edges para a Fase 2 | Pattern 2 | Baixo — ambos funcionam; recomendação de legibilidade, não de corretude. |

## Open Questions

1. **A reconexão da Fase 1 reinicia o loop corretamente?**
   - What we know: `onBotReady(bot)` roda por sessão; a D-03 aceita que o estado reinicie do zero a cada start.
   - What's unclear: Se `startCognitiveLoop` é chamado a cada reconexão, o driver externo (`while`) anterior precisa parar quando o `bot` antigo cai, para não rodar dois loops.
   - Recommendation: O `while` deve checar a vivacidade da sessão atual do bot (ex.: flag setada no `'end'`/`'kicked'`) e encerrar quando a sessão morre; o novo `onBotReady` inicia um loop fresco. Planner: verificar eventos de fim em `src/bot/connection.ts`.

2. **Detecção de "progresso" para a rede anti-repetição (D-10):**
   - What we know: o executor já detecta "sem progresso" físico (watchdog) dentro de uma skill.
   - What's unclear: o "progresso" de alto nível entre ticks (ex.: a contagem do bloco-alvo diminuiu?) precisa de um sinal derivado do snapshot.
   - Recommendation: Definir progresso por estado (Gathering: `nearbyBlockTypes[target].count` caiu ou inventário do item subiu; Exploring: posição mudou > X blocos). É lógica de regra fixa pequena — detalhar no plano.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Bun | runtime/instalação | ✓ | 1.3.2 | Node 20/22 (fallback do projeto) |
| `@langchain/langgraph` | loop cognitivo | ✗ (a instalar) | 1.4.4 disponível no npm | — |
| `@langchain/core` | peer do langgraph | ✗ (a instalar) | 1.2.0 disponível | — |
| Servidor Minecraft Java local | rodar/observar o loop ao vivo (Critério #2) | — (não verificável nesta máquina headless) | MC 1.21.4 (config) | Smoke test de tipos/loop sem servidor para a lógica pura |

**Missing dependencies with no fallback:** Nenhuma bloqueante — `@langchain/langgraph` + `@langchain/core` instalam limpo sob Bun (`[VERIFIED]`).
**Missing dependencies with fallback:** Validação ao vivo do comportamento autônomo (Critério #2) exige o servidor Java local — não disponível nesta máquina de pesquisa; verificação ao vivo fica para a execução/UAT.

## Project Constraints (from CLAUDE.md)

- **Conventional Commits com emojis (MANDATÓRIO):** todo commit segue `<emoji> <type>(scope): <descrição>` (ex.: `✨ feat(cognition): ...`, `✅ test(memory): ...`). **NUNCA** incluir linhas `🤖 Generated with...` / `Co-Authored-By: Claude`.
- **Idioma pt-BR:** comunicação, docs e comentários em português; identificadores e nomes de API em inglês.
- **GSD workflow enforcement:** edições de arquivo só dentro de um comando GSD (`/gsd:execute-phase`).
- **Stack travado (CLAUDE.md):** TypeScript de ponta a ponta, Bun como runtime (Node fallback), `@langchain/langgraph` para o loop, **LM Studio só na Fase 3** — esta fase é estritamente sem-LLM. ⚠️ A versão `0.4.x` citada na CLAUDE.md/STACK.md está desatualizada — ver Pitfall 2.

## Sources

### Primary (HIGH confidence)
- **Runtime-test próprio** (`@langchain/langgraph@1.4.4` + `@langchain/core@1.2.0` sob Bun 1.3.2, 2026-06-18) — confirmou: `Annotation.Root`/`StateGraph`/`addNode`/`addEdge`/`addConditionalEdges`/`compile({checkpointer})`, `MemorySaver` JS-puro, `START`/`END` = `__start__`/`__end__`, acúmulo de estado por `thread_id` entre invocações, e `GraphRecursionError` aos 25 super-steps num self-loop.
- **npm registry** (queried 2026-06-18) — `@langchain/langgraph` latest=1.4.4 (publish 2026-06-17), dist-tags, peerDependencies (`@langchain/core ^1.1.48`, `zod ^3.25.32 || ^4.2.0`); `@langchain/core` 1.2.0; 0.4.x congelada em 0.4.9; `js-tiktoken` em peers do core.
- https://docs.langchain.com/oss/javascript/langgraph/persistence — `MemorySaver` importado de `@langchain/langgraph`, `compile({ checkpointer })`, `thread_id` via `configurable`.

### Secondary (MEDIUM confidence)
- https://langchain-ai.github.io/langgraphjs/reference/classes/langgraph.StateGraph.html — métodos `addNode/addEdge/addConditionalEdges/compile`, constantes START/END, arestas cíclicas.
- https://docs.langchain.com/oss/javascript/langgraph/errors/GRAPH_RECURSION_LIMIT — erro `GRAPH_RECURSION_LIMIT`, ajuste de `recursionLimit` via config.
- Exemplo `define-state` (langgraphjs) — `Annotation.Root` com reducer/default, `.spec` para merge, `typeof X.State`.

### Tertiary (LOW confidence)
- https://github.com/langchain-ai/langgraphjs/issues/1524 — relato de `recursionLimit` ignorado em certos casos (2025) — apenas nota de cautela; não afeta o padrão de driver externo recomendado.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versões e peers verificados no npm; instalação testada sob Bun.
- Architecture (driver externo + Annotation/StateGraph/MemorySaver): HIGH — verificado por runtime-test sob Bun, não só por docs.
- Pitfalls (recursionLimit, 0.4.x vs 1.x): HIGH — recursionLimit reproduzido em runtime; divergência de versão confirmada no npm.
- Anti-repetição/backoff valores (N/M): LOW — Claude's discretion, sugestões de partida.

**Research date:** 2026-06-18
**Valid until:** ~2026-07-18 (30 dias; LangGraph 1.x está em release ativo — reverificar `latest` antes de pinar versão exata no plano)
