# Phase 1: Presença e Conexão (fundação sem-LLM) - Research

**Researched:** 2026-06-18
**Domain:** Mineflayer bot connection, world perception snapshot, skill execution with safety wrappers, Zod tool schemas
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Usar **Bun** como runtime desde o primeiro commit. Se um addon NAPI quebrar, registrar e cair para Node — mas começar com Bun para validar o desconhecido. Bun gerencia pacotes, executa TypeScript nativamente e é o runtime de todo o projeto.
- **D-02:** **Não usar `better-sqlite3`** (ABI mismatch no Bun). Persistência futura (Fase 2+) usará `bun:sqlite`. Não instalar `prismarine-viewer` (requer node-canvas-webgl NAPI addon).
- **D-03:** Versão do servidor: **Minecraft Java 1.21.x** (latest stable suportada pelo mineflayer 4.37.1).
- **D-04:** Tipo de servidor: **Vanilla oficial** (não Paper/Spigot).
- **D-05:** Modo de autenticação: **offline-mode** (sem auth Mojang para desenvolvimento local).
- **D-06:** Configuração de conexão (host, porta, username, versão MC) via **arquivo `.env`**. Repositório inclui `.env.example` com valores padrão.
- **D-07:** **Raio de blocos configurável** via `.env` (padrão: 32 blocos). Snapshot inclui tipos relevantes (mineráveis, sólidos, água, lava) com contagem e exemplos de posição — não serializa todos os blocos individualmente.
- **D-08:** **Entidades completas**: tipo, posição, distância, vida (se disponível), metadata (hostil/passiva, nome para jogadores).
- **D-09:** **Inventário completo slot a slot**: item ID, quantidade, metadata/enchantments, slot de equipamento (armadura, mainhand, offhand).
- **D-10:** Snapshot é um **objeto imutável** (Object.freeze ou cópia profunda) criado sob demanda. A camada cognitiva nunca recebe referência ao objeto `bot` diretamente.
- **D-11:** Implementar schemas Zod **agora na Fase 1**, mesmo sem LLM. Cada skill tem função TypeScript com parâmetros tipados + schema Zod que valida em runtime.
- **D-12:** **Skills a implementar na Fase 1:**
  - `navigate(target: {x, y, z} | BlockType)` — pathfinder até posição ou bloco-alvo (ACT-01)
  - `dig(target: BlockPosition | BlockType)` — minerar bloco-alvo (ACT-02)
  - `follow(entityName: string)` — **stub** (timeout imediato, sem lógica real)
  - `attack(entityName: string)` — **stub** (timeout imediato, sem lógica real)
- **D-13:** Toda ação física passa por um **executor centralizado** que: (a) aplica timeout configurável, (b) detecta ausência de progresso via polling periódico, (c) aplica ritmo humanizado (delay aleatório com distribuição gaussiana). Skills não acessam `bot` diretamente — passam pelo executor.

### Claude's Discretion

- Valor exato do timeout padrão por skill (sugestão: 30s navigate, 10s dig).
- Parâmetros da distribuição gaussiana para ritmo humanizado (média/desvio padrão dos delays).
- Estrutura de diretórios do projeto (src/skills/, src/perception/, etc.).
- Estratégia de logging de reconexão (console vs arquivo).

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CONN-01 | O agente conecta a um servidor Minecraft Java local e permanece online | Mineflayer `createBot()` + event lifecycle documentado |
| CONN-02 | O agente reconecta automaticamente após queda/desconexão, criando nova sessão limpa | Padrão `bot.on('end', createBot)` com delay do repo oficial + limpeza de referências |
| PERC-01 | O agente lê seu próprio status (vida, fome, posição, hora do dia) | `bot.health`, `bot.food`, `bot.entity.position`, `bot.time.timeOfDay` documentados |
| PERC-02 | O agente percebe blocos e entidades próximas, e jogadores por perto | `bot.findBlocks()`, `bot.entities`, `bot.players` documentados |
| PERC-03 | O agente lê o próprio inventário | `bot.inventory.items()` e estrutura de slots documentados |
| PERC-04 | A percepção é exposta como um snapshot imutável do mundo para a camada cognitiva | Padrão `Object.freeze` + `structuredClone` identificado; contrato `WorldSnapshot` definido |
| ACT-01 | O agente navega autonomamente até uma posição-alvo usando pathfinder | `mineflayer-pathfinder` — `pathfinder.goto(goal)` retorna Promise; goals documentados |
| ACT-02 | O agente coleta/minera um tipo de bloco-alvo | `bot.dig(block)` + `mineflayer-collectblock` para coleta de alto nível documentados |
| ACT-03 | Toda ação física tem timeout e detector de "sem progresso" | `Promise.race()` + polling periódico de posição como padrão de watchdog identificado |
| ACT-04 | As ações são executadas com ritmo humanizado (evita kick por velocidade sobre-humana) | Distribuição gaussiana para delays entre ações; valores de referência coletados |
| ACT-05 | Skills expostos como funções e como tools (Zod) sem o LLM tocar no mineflayer cru | Zod v4 `z.object()` + `.toJSONSchema()` — API verificada; padrão de wrapper documentado |
</phase_requirements>

---

## Summary

Esta fase bootstrap do projeto MineMind estabelece a fundação completa de baixo nível: conexão e reconexão com servidor Minecraft Java, leitura do estado do mundo via snapshot imutável, e execução de skills físicas com safety wrappers. É deliberadamente livre de LLM para validar os dois maiores desconhecidos técnicos antes de qualquer camada cognitiva: compatibilidade Bun 1.3.x com Mineflayer 4.37.1, e comportamento do mineflayer-pathfinder em cenários de stuck/timeout.

A stack é toda em TypeScript rodando no Bun 1.3.2 (instalado na máquina). Mineflayer 4.37.1 é o único pacote que declara `engines: { node: '>=22' }`, mas não possui native addons NAPI — o engine field é declarativo, não executado pelo Bun. Na prática, Bun 1.3.x tem sido usado com sucesso com Mineflayer (evidenciado por issues do GitHub de 2025 e pelo projeto mcpmc que usa `bun run` com Mineflayer). A única exceção é `prismarine-viewer` (node-canvas-webgl) que está explicitamente proibido pelo D-02.

O contrato `WorldSnapshot` (PERC-04) é o ponto de integração mais crítico desta fase: uma vez definido, todas as fases seguintes dependem desse tipo. O executor centralizado de skills (ACT-03, ACT-04) é o segundo contrato crítico — reutilizado sem modificação nas Fases 2 e 3.

**Primary recommendation:** Implementar na ordem CONN → PERC → ACT, pois cada camada depende da anterior. Começar com um spike de conexão + reconexão Bun↔Mineflayer antes de qualquer outra feature para validar o desconhecido crítico registrado no STATE.md.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| mineflayer | 4.37.1 | Interface com Minecraft Java — percepção e atuação | De-facto standard JS; suporta MC 1.8–1.21.11 |
| mineflayer-pathfinder | 2.4.5 | Navegação A* baseada em goals | Pairing padrão com mineflayer; `goto()` retorna Promise nativa |
| mineflayer-collectblock | 1.6.0 | Skill de alto nível "coletar bloco X" | Senta sobre pathfinder; trata toda a lógica de encontrar+navegar+minerar |
| zod | 4.4.3 | Schema validation + tool definitions para LLM | Único schema que serve como tipo TS, validação runtime e JSON Schema para tools |
| TypeScript | 5.x | Linguagem | Constraint do projeto; Bun transpila nativo |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| minecraft-protocol | 1.66.2 | Transporte (auto-pulled pelo mineflayer) | Não instalar diretamente — vem como dependência do mineflayer |
| dotenv (ou Bun built-in) | — | Carrega .env | Bun lê `.env` automaticamente sem dotenv; só instalar se precisar de `.env.local` override |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| mineflayer-collectblock | bot.dig() manual + pathfinder | collectblock abstrai: encontrar o bloco mais próximo, navegar até ele, equipar a ferramenta certa, minerar — mão-na-roda para ACT-02 |
| Object.freeze (shallow) | structuredClone + TypeScript Readonly<T> | structuredClone cria cópia profunda verdadeira (zero compartilhamento de referências com o objeto bot); freeze é raso. Para WorldSnapshot, structuredClone é mais seguro |
| Distribuição gaussiana manual | Delay fixo aleatório (Math.random) | Distribuição gaussiana (Box-Muller) é mais humana; Math.random uniforme é suspeito |

**Installation:**
```bash
bun add mineflayer@4.37.1 mineflayer-pathfinder@2.4.5 mineflayer-collectblock@1.6.0 zod@4.4.3
bun add -d typescript @types/node
```

**Version verification:** Confirmado via `npm view` em 2026-06-18 [VERIFIED: npm registry]:
- mineflayer: 4.37.1 (latest)
- mineflayer-pathfinder: 2.4.5 (latest)
- mineflayer-collectblock: 1.6.0 (latest — era 1.4.4 no STACK.md da pesquisa anterior, atualizado)
- zod: 4.4.3 (latest)

---

## Architecture Patterns

### Recommended Project Structure

```
src/
├── bot/
│   ├── connection.ts    # createBot(), reconexão automática, lifecycle events
│   └── index.ts         # entry point — monta bot + skills + inicia conexão
├── perception/
│   ├── snapshot.ts      # buildWorldSnapshot() — retorna WorldSnapshot imutável
│   └── types.ts         # tipos: WorldSnapshot, EntityInfo, InventorySlot, BlockSummary
├── skills/
│   ├── executor.ts      # SkillExecutor — timeout, watchdog, humanized delay
│   ├── navigate.ts      # navigate() + NavigateSchema (Zod)
│   ├── dig.ts           # dig() + DigSchema (Zod)
│   ├── follow.ts        # follow() stub + FollowSchema
│   ├── attack.ts        # attack() stub + AttackSchema
│   └── index.ts         # registry de skills exportados
├── config.ts            # lê .env — host, port, username, version, raio, timeouts
└── types.ts             # tipos compartilhados globais
.env
.env.example
tsconfig.json
package.json
```

### Pattern 1: Conexão e Reconexão Automática (CONN-01, CONN-02)

**What:** Função wrapper que cria o bot e registra `bot.on('end', ...)` com delay antes de recriar. Ao reconectar, cria uma instância de bot completamente nova — sem reusar referências antigas.

**When to use:** Sempre — é a única forma confiável de reconexão no Mineflayer. O `bot.reconnect()` não existe na API.

**Example:**
```typescript
// Source: https://github.com/PrismarineJS/mineflayer/blob/master/examples/reconnector.js (adaptado)
import mineflayer from 'mineflayer'
import { config } from './config'

const RECONNECT_DELAY_MS = 5_000

function createBot(): void {
  const bot = mineflayer.createBot({
    host: config.host,        // from .env
    port: config.port,        // from .env
    username: config.username, // from .env
    version: config.mcVersion, // from .env — ex: "1.21.4"
    auth: 'offline',          // D-05: offline-mode dev
  })

  bot.once('spawn', () => {
    console.log(`[MineMind] Online em ${config.host}:${config.port}`)
    // inicializar plugins (pathfinder) e expor skills aqui
  })

  bot.on('error', (err) => {
    console.error('[MineMind] Erro:', err.message)
    // não recriar aqui — 'end' é sempre emitido após 'error'
  })

  bot.on('kicked', (reason) => {
    console.warn('[MineMind] Kicked:', reason)
  })

  bot.on('end', (reason) => {
    console.log(`[MineMind] Desconectado (${reason}). Reconectando em ${RECONNECT_DELAY_MS}ms...`)
    setTimeout(createBot, RECONNECT_DELAY_MS)
    // bot reference goes out of scope — GC eligible
  })
}

createBot()
```

**PITFALL crítico:** Registrar o evento `'end'` com `bot.once` OU dentro da função wrapper — nunca com `bot.on` diretamente em escopo global, pois acumula listeners de reconexões anteriores causando memory leak.

---

### Pattern 2: WorldSnapshot Imutável (PERC-01 a PERC-04)

**What:** Função `buildWorldSnapshot(bot)` que lê o estado do mineflayer e retorna um objeto TypeScript plain (zero referências ao bot) deep-frozen via `structuredClone`.

**When to use:** Chamado pela camada cognitiva (Fase 2+) antes de cada ciclo Observe. Nunca chamado em hot-loop — é sob demanda.

**Example:**
```typescript
// Source: Mineflayer API docs (https://github.com/PrismarineJS/mineflayer/blob/master/docs/api.md)
import type { Bot } from 'mineflayer'
import type { WorldSnapshot } from './types'
import { config } from '../config'

export function buildWorldSnapshot(bot: Bot): WorldSnapshot {
  const pos = bot.entity.position

  // Status (PERC-01)
  const status = {
    health: bot.health,
    food: bot.food,
    position: { x: pos.x, y: pos.y, z: pos.z },
    timeOfDay: bot.time.timeOfDay,  // 0.0–1.0; isDay = timeOfDay < 0.5
    isDay: bot.time.timeOfDay < 0.5,
  }

  // Entidades (PERC-02)
  const entities = Object.values(bot.entities)
    .filter(e => e !== bot.entity)
    .map(e => ({
      id: e.id,
      type: e.type,            // 'player' | 'mob' | 'object' | ...
      name: e.username ?? e.name ?? e.type,
      position: { x: e.position.x, y: e.position.y, z: e.position.z },
      distance: pos.distanceTo(e.position),
      health: (e as any).health ?? null,
      metadata: (e as any).metadata ?? null,
    }))
    .filter(e => e.distance <= config.perceptionRadius)
    .sort((a, b) => a.distance - b.distance)

  // Jogadores (PERC-02)
  const players = Object.values(bot.players)
    .filter(p => p.entity && p.username !== bot.username)
    .map(p => ({
      username: p.username,
      displayName: p.displayName,
      gamemode: p.gamemode,
      ping: p.ping,
      position: p.entity
        ? { x: p.entity.position.x, y: p.entity.position.y, z: p.entity.position.z }
        : null,
      distance: p.entity ? pos.distanceTo(p.entity.position) : null,
    }))

  // Blocos por tipo (PERC-02) — resumo, não serialização individual
  const blockRadius = config.perceptionRadius
  const blockTypes = new Map<string, { count: number; examples: {x:number,y:number,z:number}[] }>()
  const blocksFound = bot.findBlocks({
    maxDistance: blockRadius,
    count: 200,
    matching: (block) => block.type !== 0, // != air
  })
  for (const bpos of blocksFound) {
    const block = bot.blockAt(bpos)
    if (!block) continue
    const name = block.name
    if (!blockTypes.has(name)) blockTypes.set(name, { count: 0, examples: [] })
    const entry = blockTypes.get(name)!
    entry.count++
    if (entry.examples.length < 3) entry.examples.push({ x: bpos.x, y: bpos.y, z: bpos.z })
  }

  // Inventário (PERC-03)
  const inventory = bot.inventory.items().map(item => ({
    slot: item.slot,
    name: item.name,
    type: item.type,
    count: item.count,
    metadata: item.metadata,
    nbt: item.nbt ?? null,
  }))

  const snapshot: WorldSnapshot = {
    capturedAt: Date.now(),
    status,
    entities,
    players,
    nearbyBlockTypes: Object.fromEntries(blockTypes),
    inventory,
  }

  // D-10: imutável — structuredClone garante zero referências ao bot original
  return Object.freeze(structuredClone(snapshot)) as WorldSnapshot
}
```

---

### Pattern 3: Executor Centralizado com Safety Wrappers (ACT-03, ACT-04)

**What:** Classe `SkillExecutor` que envolve qualquer skill async com: (1) timeout via `Promise.race`, (2) watchdog de progresso via polling, (3) delay humanizado antes/após a ação.

**When to use:** Toda skill passa pelo executor — nenhuma skill chama `bot` diretamente sem passar por aqui.

**Example:**
```typescript
// Source: padrão Promise.race de timeout — ASSUMED (baseado em padrão JS padrão, verificado como correto)
// Ref watchdog: https://oss.issuehunt.io/r/PrismarineJS/mineflayer-pathfinder/issues/205

type ProgressChecker = () => number  // retorna valor que deve mudar para indicar progresso

interface ExecuteOptions {
  timeoutMs?: number
  progressChecker?: ProgressChecker
  progressIntervalMs?: number
  noProgressToleranceMs?: number
}

// Distribuição gaussiana Box-Muller (sem dependência externa)
function gaussianDelay(meanMs: number, stdDevMs: number): number {
  let u = 0, v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  const normal = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v)
  return Math.max(0, Math.round(meanMs + normal * stdDevMs))
}

async function executeWithSafety<T>(
  action: () => Promise<T>,
  opts: ExecuteOptions = {}
): Promise<T> {
  const {
    timeoutMs = 30_000,
    progressChecker,
    progressIntervalMs = 2_000,
    noProgressToleranceMs = 10_000,
  } = opts

  // Delay humanizado ANTES da ação (ACT-04)
  // Valores Claude's discretion: média 300ms, stddev 100ms — natural entre ações
  await new Promise(r => setTimeout(r, gaussianDelay(300, 100)))

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`Skill timeout after ${timeoutMs}ms`)), timeoutMs)
  )

  // Watchdog de progresso
  let watchdogInterval: ReturnType<typeof setInterval> | null = null
  const watchdogPromise = new Promise<never>((_, reject) => {
    if (!progressChecker) return
    let lastValue = progressChecker()
    let lastProgressAt = Date.now()
    watchdogInterval = setInterval(() => {
      const current = progressChecker()
      if (current !== lastValue) {
        lastValue = current
        lastProgressAt = Date.now()
      } else if (Date.now() - lastProgressAt > noProgressToleranceMs) {
        reject(new Error(`No progress detected for ${noProgressToleranceMs}ms`))
      }
    }, progressIntervalMs)
  })

  try {
    const result = await Promise.race([
      action(),
      timeoutPromise,
      ...(progressChecker ? [watchdogPromise] : []),
    ])
    // Delay humanizado APÓS a ação
    await new Promise(r => setTimeout(r, gaussianDelay(200, 80)))
    return result
  } finally {
    if (watchdogInterval) clearInterval(watchdogInterval)
  }
}
```

---

### Pattern 4: Skill com Schema Zod (ACT-05)

**What:** Cada skill exporta tanto a função TypeScript quanto o schema Zod. O schema descreve os parâmetros que o LLM vai receber na Fase 3.

**When to use:** Toda skill da Fase 1 segue este padrão — sem refatoração na Fase 3.

**Example:**
```typescript
// Source: https://zod.dev/ (Zod v4 API verificado)
import { z } from 'zod'
import type { Bot } from 'mineflayer'
import { pathfinder, goals } from 'mineflayer-pathfinder'

// Schema Zod do skill (D-11 — para uso futuro pelo LangGraph na Fase 3)
export const NavigateSchema = z.object({
  target: z.union([
    z.object({ x: z.number(), y: z.number(), z: z.number() }).describe('Coordenadas absolutas'),
    z.string().describe('Nome do tipo de bloco para navegar até o mais próximo'),
  ]).describe('Destino de navegação'),
  range: z.number().min(1).max(10).default(2).describe('Distância tolerada do alvo'),
})

export type NavigateParams = z.infer<typeof NavigateSchema>

// Função TypeScript tipada com validação Zod
export async function navigate(bot: Bot, params: unknown): Promise<void> {
  const { target, range } = NavigateSchema.parse(params)

  let goal: goals.Goal
  if (typeof target === 'string') {
    const block = bot.findBlock({ matching: (b) => b.name === target, maxDistance: 64 })
    if (!block) throw new Error(`Block type '${target}' not found within 64 blocks`)
    goal = new goals.GoalNear(block.position.x, block.position.y, block.position.z, range)
  } else {
    goal = new goals.GoalNear(target.x, target.y, target.z, range)
  }

  await bot.pathfinder.goto(goal)
}

// Tool descriptor para o LangGraph (Fase 3 consumirá isso diretamente)
export const navigateTool = {
  name: 'navigate',
  description: 'Navega até uma posição XYZ ou até o bloco do tipo especificado mais próximo',
  schema: NavigateSchema,
  execute: navigate,
}
```

---

### Anti-Patterns to Avoid

- **Reusar a instância de `bot` após desconexão:** Após `'end'`, a instância está morta. Sempre criar novo bot via `createBot()`. Manter referência ao bot antigo causa memory leak.
- **Registrar listeners com `bot.on` em escopo global:** Cada reconexão acumula mais listeners. Usar escopo da função `createBot()` para que listeners sejam GC'd junto com a instância.
- **Chamar `bot.pathfinder.goto()` sem timeout:** O pathfinder às vezes não resolve a Promise se o destino for inatingível (issue #205). Sempre envolver em `Promise.race` com timeout.
- **Usar `Object.freeze` superficial no WorldSnapshot:** `Object.freeze` é raso — propriedades de objetos aninhados continuam mutáveis. Usar `structuredClone` antes de freeze para garantir cópia profunda real.
- **Chamar `bot.findBlocks` sem `maxDistance` pequeno:** Sem limite, varre todo o chunk carregado — O(n³) em blocos. Sempre passar `maxDistance` configurável (D-07: padrão 32).
- **Parâmetros de conexão hardcoded:** D-06 exige `.env`. Nunca hardcodar host/porta/username no código.
- **Instalar `better-sqlite3` ou `prismarine-viewer`:** D-02 — causam falha de NAPI no Bun.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Navegação A* em 3D | Algoritmo de pathfinding próprio | `mineflayer-pathfinder` | Trata: blocos sólidos, água, lava, quedas, saltos, obstáculos dinâmicos |
| "Coletar bloco X mais próximo" | Loop manual de findBlock + navigate + dig | `mineflayer-collectblock` | Trata: encontrar o bloco mais próximo, navegar até ele, equipar ferramenta correta, minerar, coletar drop |
| Schema validation para params de skills | Validação manual com `if/typeof` | `zod` | Type inference TS automática + validação runtime + `.toJSONSchema()` para Fase 3 |
| Imutabilidade profunda de objetos | Recursão manual de Object.freeze | `structuredClone()` (built-in Node/Bun) + `Object.freeze` shallow | `structuredClone` é built-in desde Node 17/Bun — sem dependência, cópia profunda verdadeira |
| Distribuição gaussiana de delays | Importar biblioteca de estatística | Implementação Box-Muller inline (4 linhas) | Sem dependência; suficiente para humanização de delays |

**Key insight:** Mineflayer já abstrai todo o protocolo de rede Minecraft. Pathfinder abstrai toda a navegação. CollectBlock abstrai toda a lógica de mineração. A única tarefa desta fase é compor essas abstrações com safety wrappers.

---

## Common Pitfalls

### Pitfall 1: `mineflayer` declara `engines: { node: '>=22' }` — Bun interpreta diferente

**What goes wrong:** O desenvolvedor vê `engines: { node: '>=22' }` no package.json do mineflayer e assume que Bun não pode executar. Tenta mudar para Node prematuramente.

**Why it happens:** Bun não executa o `engines` check do mesmo jeito que Node/npm. O campo `engines` no mineflayer é declarativo (aviso para devs Node) — não há native addons NAPI no mineflayer core que efetivamente bloqueiem Bun. [VERIFIED: npm registry] `npm view mineflayer engines` retorna `{ node: '>=22' }`. [ASSUMED] Bun ignora este campo e executa o pacote JS/TS normalmente.

**How to avoid:** Prosseguir com Bun como decidido. Se o bot falhar ao conectar, diagnosticar o erro real — não assumir que é o `engines` field. O bloqueio real seria uma mensagem de erro de NAPI addon (ex: `napi_register_module_v1 not found`).

**Warning signs:** Erro de NAPI = problema real. Simples aviso de engines no install = ignorar.

---

### Pitfall 2: `pathfinder.goto()` nunca resolve

**What goes wrong:** O bot fica parado indefinidamente. O loop principal trava aguardando `await pathfinder.goto(goal)`.

**Why it happens:** Quando o destino é inatingível (bloco atrás de bedrock, ou flutuando no ar sem suporte), o pathfinder calcula um path parcial e entra em loop sem lançar erro. Issue #205 / #222 no mineflayer-pathfinder.

**How to avoid:** SEMPRE envolver `pathfinder.goto()` em `Promise.race` com timeout (recomendado: 30s para navigate). O executor centralizado (Pattern 3) faz isso. NUNCA chamar `pathfinder.goto()` diretamente nas skills.

**Warning signs:** Bot parado no mesmo lugar por mais de 10s sem emitir `path_update`.

---

### Pitfall 3: Memory leak de listeners na reconexão

**What goes wrong:** Depois de muitas reconexões, o processo Node/Bun fica lento ou trava. Mensagens de `MaxListenersExceededWarning` aparecem.

**Why it happens:** O padrão ingênuo `bot.on('end', createBot)` dentro de um escopo global acumula um listener por reconexão na instância global do EventEmitter.

**How to avoid:** O padrão correto (Pattern 1) registra `bot.on('end', ...)` dentro do escopo da função `createBot()`. Cada bot criado tem seus próprios listeners. Quando `'end'` dispara, a função callback cria um novo bot — a instância antiga e seus listeners ficam sem referência e são GC'd.

**Warning signs:** Warnings de MaxListeners; crescimento contínuo de memória ao longo de horas.

---

### Pitfall 4: `bot.findBlocks()` com raio grande trava o event loop

**What goes wrong:** O servidor de Minecraft carrega chunks de 16x256x16 blocos. Chamar `findBlocks()` com `maxDistance: 128` pode iterar centenas de milhares de blocos, bloqueando o event loop por dezenas de ms.

**Why it happens:** `findBlocks` é síncrono — roda no mesmo thread do Bun/Node. O Minecraft carrega chunks agressivamente.

**How to avoid:** Manter `maxDistance` ≤ 64 no uso geral (D-07 padrão: 32). Para buscas semânticas do snapshot, usar `count` para limitar resultados (ex: `count: 200`). Considerar executar o `buildWorldSnapshot` com `setImmediate` para não bloquear o tick do bot.

**Warning signs:** Server ticking mais lento que 20 TPS; lag nos movimentos do bot.

---

### Pitfall 5: `bot.inventory.items()` retorna vazio antes do `spawn` completo

**What goes wrong:** Chamar `buildWorldSnapshot()` durante o boot retorna inventário vazio mesmo que o bot tenha itens.

**Why it happens:** O servidor envia o inventário do player em pacotes que chegam após o evento `spawn`. O Mineflayer popula `bot.inventory` de forma assíncrona.

**How to avoid:** Só chamar `buildWorldSnapshot()` após `bot.once('spawn', ...)` ter disparado. Garantir no código de inicialização que o snapshot nunca é solicitado antes do spawn.

**Warning signs:** Inventário sempre vazio na primeira leitura após conexão/reconexão.

---

### Pitfall 6: Versão do servidor Minecraft incompatível

**What goes wrong:** Bot se conecta mas imediatamente desconecta com `"This server is version 1.21.X, you are using version 1.21..."`.

**Why it happens:** Mineflayer 4.37.1 lista no README suporte a 1.8–1.21.11, mas issues recentes (#3714, #3804) mostram que 1.21.7+ e 1.21.11 podem ter problemas de protocolo não totalmente resolvidos. O campo `version` no `createBot()` deve bater exatamente com a versão do servidor.

**How to avoid:** Usar `version: "1.21.4"` no `.env` (versão stable de Dezembro 2024, bem testada). Configurar o servidor Vanilla com a mesma versão. D-03 especifica 1.21.x — **recomenda-se 1.21.4** como target específico.

**Warning signs:** Erro de protocolo imediatamente após conexão; bot nunca emite `spawn`.

---

## Code Examples

### Configuração via .env

```typescript
// src/config.ts
// Source: Bun built-in .env loading — https://bun.sh/docs/runtime/env [VERIFIED: bun.sh]
export const config = {
  host: process.env.MC_HOST ?? 'localhost',
  port: parseInt(process.env.MC_PORT ?? '25565'),
  username: process.env.MC_USERNAME ?? 'MineMind',
  mcVersion: process.env.MC_VERSION ?? '1.21.4',
  perceptionRadius: parseInt(process.env.PERCEPTION_RADIUS ?? '32'),
  navigateTimeoutMs: parseInt(process.env.NAVIGATE_TIMEOUT_MS ?? '30000'),
  digTimeoutMs: parseInt(process.env.DIG_TIMEOUT_MS ?? '10000'),
} as const
```

```bash
# .env.example
MC_HOST=localhost
MC_PORT=25565
MC_USERNAME=MineMind
MC_VERSION=1.21.4
PERCEPTION_RADIUS=32
NAVIGATE_TIMEOUT_MS=30000
DIG_TIMEOUT_MS=10000
```

---

### Configuração do mineflayer-pathfinder

```typescript
// Source: https://github.com/PrismarineJS/mineflayer-pathfinder/blob/master/readme.md [CITED]
import { pathfinder, Movements } from 'mineflayer-pathfinder'

bot.once('spawn', () => {
  bot.loadPlugin(pathfinder)
  const movements = new Movements(bot)
  movements.canDig = true         // permite mineração durante navegação
  movements.allowSprinting = true // velocidade humana com sprinting
  bot.pathfinder.setMovements(movements)
})
```

---

### Tipos TypeScript do WorldSnapshot

```typescript
// src/perception/types.ts
export interface WorldSnapshot {
  readonly capturedAt: number
  readonly status: {
    readonly health: number
    readonly food: number
    readonly position: { readonly x: number; readonly y: number; readonly z: number }
    readonly timeOfDay: number
    readonly isDay: boolean
  }
  readonly entities: ReadonlyArray<{
    readonly id: number
    readonly type: string
    readonly name: string
    readonly position: { readonly x: number; readonly y: number; readonly z: number }
    readonly distance: number
    readonly health: number | null
    readonly metadata: unknown
  }>
  readonly players: ReadonlyArray<{
    readonly username: string
    readonly displayName: string
    readonly gamemode: number
    readonly ping: number
    readonly position: { readonly x: number; readonly y: number; readonly z: number } | null
    readonly distance: number | null
  }>
  readonly nearbyBlockTypes: Readonly<Record<string, {
    readonly count: number
    readonly examples: ReadonlyArray<{ readonly x: number; readonly y: number; readonly z: number }>
  }>>
  readonly inventory: ReadonlyArray<{
    readonly slot: number
    readonly name: string
    readonly type: number
    readonly count: number
    readonly metadata: number
    readonly nbt: unknown
  }>
}
```

---

### Configuração do servidor Minecraft Vanilla offline-mode

```properties
# server.properties — configurações mínimas para desenvolvimento local
online-mode=false
difficulty=peaceful
spawn-protection=0
max-players=5
view-distance=8
simulation-distance=8
```

**Como iniciar (Vanilla 1.21.4):**
```bash
java -Xmx2G -Xms1G -jar server.jar nogui
# Na primeira execução: aceitar EULA em eula.txt (eula=true)
```

Java 25 (Temurin) está instalado na máquina — compatível com Minecraft 1.21.4 que exige Java 21+. [VERIFIED: ambiente local]

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `sqlite-vss` para vetores | `sqlite-vec` | 2024 | sqlite-vss deprecated — fora do escopo Fase 1 mas relevante para Fase 4 |
| mineflayer `engines: >=18` | mineflayer `engines: >=22` | 4.37.x | Engine field atualizado — declarativo, não bloqueia Bun |
| mineflayer-collectblock 1.4.4 | mineflayer-collectblock 1.6.0 | 2025 | Versão no STACK.md estava desatualizada |
| Zod v3 `.email()`, `.uuid()` | Zod v4 `z.email()`, `z.uuidv4()` top-level + `.toJSONSchema()` | Ago 2025 | v4 tem JSON Schema nativo — elimina dependência de `zodToJsonSchema` |

**Deprecated/outdated:**
- `mineflayer-collectblock@1.4.4`: Versão no STACK.md pesquisa anterior estava errada — latest é 1.6.0 [VERIFIED: npm registry]
- `zodToJsonSchema` (biblioteca separada): Zod v4 tem `.toJSONSchema()` built-in — não instalar a biblioteca separada [CITED: zod.dev/v4]

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Bun 1.3.2 executa mineflayer 4.37.1 sem erros NAPI (apesar do campo `engines: node>=22`) | Standard Stack, Pitfall 1 | Se Bun bloquear por engines field ou NAPI interno não detectado, cair para Node 24 (instalado). Fase 1 inclui spike de validação explícito. |
| A2 | MC 1.21.4 é a versão 1.21.x mais estável com mineflayer 4.37.1 | Pitfall 6, Code Examples | Se 1.21.4 tiver bugs no mineflayer, tentar 1.21.1 ou 1.20.4 que são versões historicamente estáveis |
| A3 | `structuredClone()` está disponível no Bun 1.3.2 | Pattern 2 (WorldSnapshot) | structuredClone é Web API padrão desde Node 17 / Bun 1.0 — risco muito baixo |
| A4 | `bot.inventory.items()` retorna array de itens com propriedades `.slot`, `.name`, `.type`, `.count`, `.metadata`, `.nbt` | Pattern 2 (WorldSnapshot) | Se a API de inventário mudou, ajustar o mapeamento no buildWorldSnapshot |
| A5 | Parâmetros humanização de delays (média 300ms/stddev 100ms pré-ação; 200ms/80ms pós-ação) são suficientes para evitar kick anti-cheat em servidor vanilla local | Pattern 3 (executor) | Servidor vanilla local sem anti-cheat não tem kick por velocidade — risco mínimo em dev |

---

## Open Questions

1. **Compatibilidade Bun 1.3.2 com Mineflayer 4.37.1 em runtime**
   - What we know: Issues do GitHub de 2025 mostram usuários rodando Mineflayer com Bun; projeto mcpmc usa `bun run` com Mineflayer; crypto do Minecraft funciona no Bun desde 1.2.6. Bun 1.3.2 está instalado na máquina.
   - What's unclear: Há NAPI addons transitivos (prismarine-chunk?) que possam falhar silenciosamente?
   - Recommendation: **Wave 0 do plano deve incluir um spike de conexão** — `bun run src/bot/index.ts` deve conectar ao servidor, emitir `spawn`, e desconectar limpo. Se falhar com erro NAPI, cair para Node 24 (também instalado). Este spike resolve o blocker do STATE.md.

2. **Versão exata do Minecraft 1.21.x para o servidor local**
   - What we know: 1.21.4 foi lançado em Dezembro 2024 e é amplamente testado. 1.21.7+ tem issues de protocol mismatch no mineflayer. 1.21.11 tem issue aberta sem solução.
   - What's unclear: O usuário já tem um servidor local configurado? Qual versão?
   - Recommendation: Se não há servidor existente, usar 1.21.4 vanilla. Se o usuário já tem um servidor em outra versão 1.21.x, testar primeiro — se não funcionar, baixar 1.21.4.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Bun | Runtime + package manager | ✓ | 1.3.2 | Node 24.12.0 (instalado) |
| Node.js | Fallback runtime | ✓ | 24.12.0 | — |
| Java (JRE/JDK) | Minecraft server | ✓ | OpenJDK 25.0.2 (Temurin) | — |
| Minecraft server | Testes locais (CONN-01/02) | ✗ | — | Deve ser baixado/configurado (Wave 0) |
| npm | Verificação de versões | ✓ | 11.6.2 | — |

**Missing dependencies with no fallback:**
- Servidor Minecraft local (Java 1.21.4 vanilla) — deve ser configurado antes dos testes de CONN-01/02. Download: https://mcversions.net/download/1.21.4

**Missing dependencies with fallback:**
- Nenhum (Bun presente, Java presente, Node presente como fallback).

---

## Security Domain

> `security_enforcement` não configurado explicitamente em config.json — tratado como habilitado.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | Não (offline-mode dev — sem auth) | N/A — D-05 |
| V3 Session Management | Parcial | Reconexão cria sessão limpa — sem estado persistido nesta fase |
| V4 Access Control | Não | Servidor local dev apenas |
| V5 Input Validation | Sim | Zod `.parse()` em todos os parâmetros de skills antes de executar |
| V6 Cryptography | Não (offline-mode) | N/A para dev local; Bun tem crypto do Minecraft para online-mode se necessário |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Injeção via parâmetros de skill (ex: nome de bloco contendo código) | Tampering | Zod schema — `z.enum()` ou `z.string().max(64)` para nomes de blocos; parse antes de usar |
| Variáveis de ambiente com valores maliciosos | Tampering | `config.ts` valida e aplica defaults sensatos — nunca usa `process.env.X` diretamente em código de ação |
| Servidor offline-mode sem auth | Elevation of Privilege | ACEITÁVEL em dev local — documentado em D-05; não usar offline-mode em produção |

---

## Sources

### Primary (HIGH confidence)
- [VERIFIED: npm registry] — versões exatas: mineflayer 4.37.1, mineflayer-pathfinder 2.4.5, mineflayer-collectblock 1.6.0, zod 4.4.3
- [CITED: github.com/PrismarineJS/mineflayer/blob/master/docs/api.md] — createBot() options, eventos de conexão (spawn, end, kicked, error), bot.entity, bot.time, bot.findBlocks(), bot.findBlock(), bot.players, bot.dig()
- [CITED: github.com/PrismarineJS/mineflayer-pathfinder/blob/master/readme.md] — loadPlugin, Movements, GoalBlock, GoalNear, GoalXZ, goto(), stop(), thinkTimeout, tickTimeout
- [CITED: zod.dev/v4] — z.object(), z.string(), z.number(), z.union(), .parse(), .safeParse(), z.infer, .toJSONSchema(), mudanças v3→v4
- [CITED: github.com/PrismarineJS/mineflayer/blob/master/examples/reconnector.js] — padrão canônico de reconexão automática

### Secondary (MEDIUM confidence)
- [github.com/PrismarineJS/mineflayer/issues/3714, #3804] — issues de compatibilidade com MC 1.21.7 e 1.21.11 — suporte a versões específicas
- [oss.issuehunt.io/r/PrismarineJS/mineflayer-pathfinder/issues/205] — goto() às vezes não resolve Promise
- [github.com/JesseRWeigel/mineflayer-chatgpt] — padrão de estrutura src/bot/perception.ts + src/skills/executor.ts
- [bun.sh/docs/runtime/sqlite] — bun:sqlite built-in (relevante para Fase 2+)

### Tertiary (LOW confidence)
- WebSearch geral sobre Bun + Mineflayer runtime compatibility 2025-2026 — evidência anedótica de funcionamento, não documentação oficial

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versões verificadas via npm registry em 2026-06-18
- Architecture: HIGH — baseado em API oficial documentada + exemplos canônicos do PrismarineJS
- Pitfalls: MEDIUM/HIGH — combinação de issues oficiais do GitHub + padrões JS conhecidos
- Compatibilidade Bun↔Mineflayer: LOW/MEDIUM — evidência anedótica; requer spike de validação

**Research date:** 2026-06-18
**Valid until:** 2026-07-18 (30 dias — stack estável, mas mineflayer atualiza com frequência moderada)
