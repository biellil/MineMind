# Architecture Research

**Domain:** Integração das capacidades do milestone v2.0 ("Autonomia de Verdade") na arquitetura cognitiva EXISTENTE do MineMind (Mineflayer + LangGraph 1.x + LM Studio/GPT, processo único Bun)
**Researched:** 2026-06-19
**Confidence:** HIGH (lido o código real — `loop.ts`, `nodes.ts`, `graph.ts`, `deliberation.ts`, `arbiter.ts`, `state.ts`, `goals.ts`, `motivation/types.ts`, `skills/*`, `config.ts`, `llm/provider.ts`; padrões System 1/2/DAG ancorados na FEATURES.md e prior art Voyager/GITM/mc-agents)

> **Tese desta pesquisa:** quase nada em v2.0 é componente novo de topo. As cinco perguntas se resolvem **estendendo costuras que já existem** — o `arbiter` reativo vira System 1, `dependsOn` (hoje sempre `[]`) vira o DAG, `playerRequestPending`+`source:'player_request'` viram o modo assistente, o padrão `progressChecker` do `executor` vira o grounding, e a `factory` `createLmStudioProvider` ganha um irmão `createOpenAiProvider` atrás da `LlmProvider` que já abstrai tudo. **Não criar máquina de modos paralela, não criar nó de reflexão, não criar segundo loop.**

> **Correção factual importante (drift de doc):** o comentário em `state.ts` diz "persistência EM-PROCESSO apenas, sem disco". O código real **já persiste em SQLite** (`holder.db`, `persistHolder`, `consolidate`, `retrieve`). A v2.0 deve tratar o SQLite como existente. O ARCHITECTURE do v1.0 (`v1.0-research/`) também está desatualizado (descreve 8-9 nós e `better-sqlite3`; o real são 5 nós finitos + `bun:sqlite` + `MemorySaver`). **Esta pesquisa reflete o código, não os docs antigos.**

---

## Standard Architecture

### System Overview — onde cada feature v2.0 encaixa

```
┌──────────────────────────────────────────────────────────────────────────┐
│                    PROCESSO ÚNICO (Bun) — startCognitiveLoop(bot, holder)  │
│                                                                            │
│  ┌──────────────────────────────────────────────────────────────────┐    │
│  │  DRIVER EXTERNO (loop.ts)  — "aresta de retorno" = re-invoke/tick  │    │
│  │  while(alive): graph.invoke()  +  maybeDeliberate(void, async)     │    │
│  │                                                                    │    │
│  │  ┌── System 1 REFLEXO (NOVO: promove arbiter) ──────────────────┐  │    │
│  │  │  reflexes(snapshot) → ação imediata SEM LLM:                 │  │    │
│  │  │  comer · fugir/defender mob · abrigo-emergência              │◀─┼──┐ │
│  │  │  roda DENTRO do tick rápido (antes/no observe), sub-segundo  │  │  │ │
│  │  └─────────────────────────────────────────────────────────────┘  │  │ │
│  │                                                                    │  │ │
│  │  ┌── StateGraph FINITO por tick (graph.ts) — System 2 RÁPIDO ───┐  │  │ │
│  │  │  observe → analyze → updateMemory → decide → execute → END    │  │  │ │
│  │  │   │grounding↑                                  │grounding↑    │  │  │ │
│  │  │  needs/goals(DAG)   lê llmDecision fresca   UMA skill aguardada│  │  │ │
│  │  └───────────────────────────────────────────────────────────────┘  │ │
│  │                                                                    │  │ │
│  │  ┌── Deliberação LLM LENTA single-flight (deliberation.ts) ──────┐  │  │ │
│  │  │  maybeDeliberate(): UMA inferência por vez (inFlight lock)     │  │  │ │
│  │  │  trigger ∈ {chat,goal_changed,need_threshold,periodic,reflect}│──┘  │ │
│  │  │  escreve holder.llmDecision  ·  reflect REUSA este caminho     │     │ │
│  │  └───────────────────────────────────────────────────────────────┘    │ │
│  └────────────┬───────────────────────┬───────────────────┬──────────────┘ │
│               │ snapshot (read-only)   │ skills (1/tick)    │ holder (mente) │
│  ┌────────────▼─────┐   ┌──────────────▼────────┐   ┌───────▼─────────────┐  │
│  │  PERCEPTION      │   │  SKILLS (Action Layer) │   │ CognitiveStateHolder│  │
│  │ buildWorldSnap   │   │ navigate·dig·follow·   │   │ control·safety·     │  │
│  │ (+inventory já   │   │ attack +NOVOS: craft·  │   │ memory·needs·goals· │  │
│  │  no snapshot →   │   │ place·smelt·eat·flee·  │   │ currentGoal·        │  │
│  │  GROUNDING)      │   │ shelter   (grounded)   │   │ disposition·        │  │
│  └────────┬─────────┘   └──────────┬─────────────┘   │ playerRequestPending│  │
│           │                        │                 │ llmDecision·db·     │  │
│  ┌────────▼────────────────────────▼──────────────┐  │ personality         │  │
│  │  MINEFLAYER ADAPTER (bot/connection.ts)          │  └───────┬─────────────┘  │
│  │  cria bot, plugins, reconexão (MESMO holder)     │          │ persist        │
│  └────────┬─────────────────────────────────────────┘  ┌───────▼─────────────┐  │
│           │ protocolo TCP            ┌──────────────┐   │  MEMORY (bun:sqlite │  │
│  ┌────────▼─────────┐                │ LLM PROVIDER │   │  + sqlite-vec)      │  │
│  │ Minecraft Java   │                │ FACTORY(NOVO)│   │ shortTerm·longTerm· │  │
│  │ 1.21.4 (local)   │                │ LM Studio │   │ holder·profiles·    │  │
│  └──────────────────┘                │ GPT-4.1-mini│   │ vec·personality     │  │
│                                       └──────────────┘   └─────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities — NOVO vs MODIFICADO vs INTACTO

| Component | Status v2.0 | Responsibility | Onde |
|-----------|-------------|----------------|------|
| **System 1 reflexo** (`cognition/reflexes.ts`) | **NOVO** | Sobrevivência sub-segundo SEM LLM: comer, fugir/defender de mob hostil, abrigo de emergência. Função pura `decideReflex(snapshot, holder)` → `ReflexAction \| null`, executada no tick rápido ANTES da deliberação. Promove a intenção do `arbiter` reativo a ação imediata. | `loop.ts` chama no topo do tick; reusa `skills` |
| `arbiter.ts` | **MODIFICADO** | Continua sendo o piso determinístico (D-17), mas ganha `'fighting'`/`'building'` reais na `arbitrate()` e expõe a detecção de mob hostil que o System 1 consome. | `cognition/arbiter.ts` |
| **Tech tree DAG** (`motivation/techtree.ts`) | **NOVO** | Catálogo data-driven (via `minecraft-data`) de pré-requisitos item→(materiais+ferramenta) e resolução recursiva de qual sub-objetivo destravar dado o inventário. Preenche o campo `Goal.dependsOn` que hoje é sempre `[]`. | `motivation/techtree.ts` + estende `goals.ts` |
| `goals.ts` (`generateGoals`/`selectGoal`) | **MODIFICADO** | `generateGoals` passa a emitir, além dos goals-por-need, os goals-por-tech-tree (a próxima tarefa destravável). `selectGoal` ganha resolução de `dependsOn` (escolhe o ancestral pronto, não o folha bloqueado). | `motivation/goals.ts` |
| `motivation/types.ts` | **MODIFICADO** | `NeedKind` ganha `shelter`/`social` ATIVOS (hoje stub); novo `GoalSource: 'tech'`; `Goal` ganha campo opcional de meta-item. Mudanças aditivas, retrocompatíveis. | `motivation/types.ts` |
| **Grounding** (`skills/grounding.ts`) | **NOVO** | Wrapper/helper que captura estado real (inventário, posição, bloco-alvo) antes/depois de cada skill e retorna um `SkillResult` verificado. Generaliza o `progressChecker` do `dig` para um resultado factual ("craftou 4 tábuas? confirmado pelo inventário"). | `skills/grounding.ts` + altera contrato das skills |
| skills `craft`/`smelt`/`place`/`eat`/`flee`/`shelter` | **NOVO** | Comportamentos sobre API NATIVA do mineflayer (`recipesFor`/`craft`, `openFurnace`, `placeBlock`, `consume`, pathfinder-away). Sem plugins de combate/auto-eat (ver STACK.md). Cada um grounded. | `skills/` |
| skills `navigate`/`dig`/`follow`/`attack` | **MODIFICADO** | Passam a retornar `SkillResult` grounded (hoje retornam `void`/lançam). `dig` já tem o padrão de verificação — generalizar. | `skills/*` |
| `nodes.ts` (`execute`) | **MODIFICADO** | Mapeia os estados `fighting`/`building` (hoje no-op stub) para as skills novas; consome `SkillResult` em vez de só `success/failure`; grava o resultado grounded na memória. | `cognition/nodes.ts` |
| **Modo Assistente** | **MODIFICADO (reuso)** | NÃO é máquina de modos nova. É `holder.playerRequestPending=true` + um `Goal{source:'player_request'}` de alta prioridade com condição-de-saída (progresso=1 ou TTL). A preempção já existe em `selectGoal`. | `chat/conversation.ts` seta o sinal; `goals.ts` resolve |
| **LLM Provider Factory** (`llm/provider.ts`) | **MODIFICADO** | Adiciona `createOpenAiProvider()` (GPT-4.1-mini) irmão de `createLmStudioProvider()`, ambos retornando a MESMA interface `LlmProvider`. `createProvider()` despacha por `config.llmProvider`. | `llm/provider.ts` |
| `loop.ts` (driver) | **MODIFICADO** | Insere a chamada do System 1 no topo do tick; chama `createProvider()` em vez do `createLmStudioProvider()` fixo. Resto intacto (single-flight, reflexão, flush). | `cognition/loop.ts` |
| `CognitiveStateHolder` / StateGraph / `deliberation` (single-flight) / memória | **INTACTO** | Estrutura preservada. v2.0 escreve nos campos existentes, não muda a topologia do grafo nem o lock `inFlight`. | — |

---

## Recommended Project Structure

```
src/
├── cognition/
│   ├── loop.ts            # MOD: + chamada System 1 no tick; + createProvider()
│   ├── reflexes.ts        # NOVO: System 1 — decideReflex(snapshot,holder) puro
│   ├── arbiter.ts         # MOD: + fighting/building na arbitrate; detecção de mob hostil
│   ├── graph.ts           # INTACTO (topologia 5-nós finita preservada)
│   ├── nodes.ts           # MOD: execute mapeia fighting/building; consome SkillResult
│   ├── deliberation.ts    # INTACTO (single-flight é a costura a preservar)
│   ├── state.ts           # INTACTO (holder já tem os campos necessários)
│   ├── reflection.ts      # INTACTO (aprendizado por reflexão já existe; só alimentar)
│   └── types.ts           # MOD: nada novo no enum (fighting/building já existem)
├── motivation/
│   ├── types.ts           # MOD: NeedKind shelter/social ativos; GoalSource 'tech'
│   ├── needs.ts           # MOD: decaimento real de shelter (noite) e fome → survival
│   ├── goals.ts           # MOD: generateGoals emite goals-tech; selectGoal resolve dependsOn
│   └── techtree.ts        # NOVO: DAG de pré-requisitos data-driven (minecraft-data)
├── skills/
│   ├── grounding.ts       # NOVO: captura estado antes/depois → SkillResult verificado
│   ├── result.ts          # NOVO: tipo SkillResult { ok, observation, delta? }
│   ├── craft.ts           # NOVO: recipesFor/craft recursivo (API nativa)
│   ├── smelt.ts           # NOVO: openFurnace + put/take (API nativa)
│   ├── place.ts           # NOVO: placeBlock (compartilhado por shelter e building)
│   ├── eat.ts             # NOVO: bot.consume (System 1)
│   ├── flee.ts            # NOVO: pathfinder goal "longe do mob" (System 1)
│   ├── shelter.ts         # NOVO: cavar/tampar via place (System 1, último recurso)
│   ├── navigate|dig|follow|attack.ts  # MOD: retornam SkillResult grounded
│   └── index.ts           # MOD: registra as skills novas no skillRegistry/toolRegistry
├── llm/
│   ├── provider.ts        # MOD: + createOpenAiProvider + createProvider(dispatch)
│   ├── structured.ts      # INTACTO (decideAction já genérico)
│   └── schemas.ts         # MOD: ActionDecision.action ganha craft/build/fight/eat/flee
└── config.ts              # MOD: + llmProvider, openaiModel, techtree thresholds, shelter
```

### Structure Rationale

- **`cognition/reflexes.ts` separado do `arbiter.ts`:** o arbiter retorna um `CognitiveState` (intenção) consumido pelo grafo; o System 1 retorna uma **ação imediata executada fora do grafo**, no driver, antes da deliberação. São responsabilidades distintas (decidir o modo vs reagir já) — mantê-los separados evita poluir a função pura do arbiter com efeito colateral.
- **`motivation/techtree.ts` separado de `goals.ts`:** o DAG é dado (catálogo de receitas/pré-requisitos), `goals.ts` é política (priorização/histerese). O `dependsOn` já está no `Goal` esperando exatamente isto — o gap é "resolução comportamental de dependências", documentado como futuro no próprio `goals.ts`.
- **`skills/grounding.ts` + `result.ts` como camada fina:** o `dig` já prova o padrão (verifica inventário via `progressChecker`). Generalizar para um `SkillResult` factual é o conserto direto do Known Gap "peguei 10 tábuas" — o relato passa a ser o que o estado confirma, não o que a skill alega.
- **Skills novas na API nativa, sem plugins:** STACK.md é taxativo — `mineflayer-pvp`/`auto-eat` estão 4 anos parados; `bot.attack`/`consume`/`craft`/`placeBlock` cobrem tudo. Adicionar só `mineflayer-tool` (peer obrigatória do collectblock 1.6.0 já instalado).

---

## Architectural Patterns

### Pattern 1: System 1 reflexo no tick, System 2 deliberativo fora dele — preservando single-flight

**What:** O System 1 é uma função **pura e síncrona** que roda no topo de cada tick do driver, ANTES da deliberação LLM. Decide reflexos de sobrevivência (comer/fugir/abrigar) lendo só o `WorldSnapshot` + `holder`, e dispara UMA skill reflexa imediata quando dispara. O System 2 (LLM lento) continua intocado em `maybeDeliberate` com o lock `inFlight`.

**When to use:** Sempre que a latência do LLM (segundos no modelo local) seria fatal — fome esgotando, mob batendo, noite caindo. É o aprendizado central do mc-agents (FEATURES.md).

**Como NÃO quebra o single-flight:** o System 1 **não usa o LLM** — logo não toca o lock `inFlight` de `DeliberationState`. Ele compete pela skill física (uma ação por vez), então a regra é: se o System 1 decide agir neste tick, o `execute` do grafo é pulado (curto-circuito), e a deliberação em voo (se houver) tem sua `llmDecision` ignorada por um tick. O lock LLM segue sendo de UMA inferência; o que o System 1 adiciona é **prioridade de execução física**, não uma segunda inferência.

**Trade-offs:** (+) sobrevivência abaixo da latência do LLM, sem segundo loop, sem segundo lock. (+) reusa skills e snapshot existentes. (−) o System 1 e o `execute` do grafo disputam "a skill do tick" — precisa de uma regra de precedência explícita (reflexo > plano deliberado) no driver. (−) o System 1 lê o snapshot ANTES do `observe` do grafo o reconstruir; aceitar uma leitura barata extra ou compartilhar o `lastSnapshot`.

**Example:**
```typescript
// cognition/reflexes.ts — PURO, sem LLM, sem efeito colateral
export type ReflexAction =
  | { kind: 'eat' }
  | { kind: 'flee'; from: Position3D }
  | { kind: 'defend'; entityId: number }
  | { kind: 'shelter' }
  | null

export function decideReflex(s: WorldSnapshot, h: CognitiveStateHolder): ReflexAction {
  // 1) fome crítica com comida no inventário → comer
  if (s.status.food <= config.eatHungerThreshold && hasFood(s.inventory)) return { kind: 'eat' }
  // 2) mob hostil próximo → defender (se equipado/forte) ou fugir
  const mob = nearestHostile(s.entities, config.hostileReactRadius)
  if (mob) return canFight(s) ? { kind: 'defend', entityId: mob.id } : { kind: 'flee', from: mob.position }
  // 3) noite + exposto + sem abrigo → cavar abrigo (último recurso)
  if (!s.status.isDay && exposedAtNight(s)) return { kind: 'shelter' }
  return null
}

// loop.ts (MOD) — topo do tick, antes da deliberação
const reflex = lastSnapshot ? decideReflex(lastSnapshot, holder) : null
if (reflex) {
  await runReflex(bot, reflex, holder)   // dispara UMA skill reflexa, grounded; grava na memória
  // pula o execute deliberado deste tick (precedência reflexo > plano)
} else {
  await graph.invoke({}, cfg)            // System 2 rápido (estado/skill do plano)
}
// deliberação LLM lenta segue idêntica (void, single-flight) — nunca tocada pelo reflexo
```

### Pattern 2: Tech tree como DAG que preenche `Goal.dependsOn`, priorizado por needs

**What:** O catálogo de pré-requisitos (item → {materiais, ferramenta, estação}) é dado estático derivado de `minecraft-data`. `generateGoals` emite, além dos goals-por-need, o **próximo objetivo destravável**: dado um objetivo-meta (ex. `iron_pickaxe`), resolve recursivamente o que falta no inventário e emite o sub-goal pronto (folha cujas dependências já estão satisfeitas). O `dependsOn` — hoje sempre `[]` — passa a carregar os IDs dos pré-requisitos. `selectGoal` escolhe o ancestral executável, não o folha bloqueado.

**When to use:** Para a progressão madeira→pedra→ferro→diamante. É a fusão GITM (estrutura do DAG) + MineMind needs (prioridade dinâmica) que a FEATURES.md identifica como o diferencial.

**Como reusa o existente:** `priority` continua vindo da urgência da need (`resources` em escassez prioriza minerar); a tech tree só **estrutura** o que o `gathering` deve buscar (a `gatheringLadder` de `config.ts` é a versão flat/v1 disto — vira derivada do DAG). A histerese/preempção de `selectGoal` não muda.

**Trade-offs:** (+) reaproveita `dependsOn`, `progress`, `priority` que já existem; o gap "resolução comportamental de dependências" documentado em `goals.ts` é exatamente este trabalho. (+) data-driven via `minecraft-data` (já transitivo) — não hardcodar receitas. (−) precisa de um goal-meta atual (qual item perseguir); deriva-se do estado (sem picareta de pedra → meta = picareta de pedra) ou do modo assistente. (−) ciclos no DAG são impossíveis em Minecraft, mas a resolução recursiva precisa de guarda de profundidade.

**Example:**
```typescript
// motivation/techtree.ts (NOVO)
interface Recipe { item: string; needs: { item: string; count: number }[]; station?: string; tool?: string }

/** Resolve o próximo sub-objetivo PRONTO para destravar `goalItem`, dado o inventário. */
export function nextUnlockable(goalItem: string, inv: InventorySummary, depth = 0): TechGoal | null {
  if (depth > 16) return null                          // guarda anti-recursão
  const r = recipeFor(goalItem)                         // de minecraft-data
  if (!r) return null
  const missing = r.needs.filter((n) => countIn(inv, n.item) < n.count)
  if (missing.length === 0 && hasTool(inv, r.tool)) return { item: goalItem, dependsOn: [] } // pronto
  // recursão: o primeiro material/ferramenta faltante vira o próximo objetivo
  const blocker = missing[0] ?? { item: r.tool!, count: 1 }
  return nextUnlockable(blocker.item, inv, depth + 1)
}

// goals.ts (MOD) — generateGoals passa a também emitir o goal-tech destravável
const techGoal = goalItem ? nextUnlockable(goalItem, invSummary(snapshot)) : null
if (techGoal) goals.push(toGoal(techGoal, urgency(resourcesNeed), 'tech', now))
```

### Pattern 3: Modo Assistente = objetivo de alta prioridade com condição-de-saída (NÃO máquina de modos)

**What:** Um pedido de jogador ("traz madeira") vira um `Goal{ source:'player_request' }` injetado e o flag `holder.playerRequestPending=true`. A preempção já existe: `selectGoal` preempta o objetivo atual quando `disposition==='ASSISTANT' && playerRequestPending` (código atual em `goals.ts`). Ao concluir (`progress>=1`) ou expirar (TTL), o goal é descartado e o agente **volta sozinho** ao curriculum autônomo — sem nenhum estado de "modo assistente" separado.

**When to use:** Sempre — é como a FEATURES.md e o PROJECT.md exigem ("atende e volta sozinho"). Evita a máquina de modos paralela que duplicaria a seleção de objetivos.

**Como reusa o existente:** `playerRequestPending`, `source:'player_request'`, e o ramo de preempção em `selectGoal` **já existem** no código. O que falta: (1) `chat/conversation.ts` (ou um parser de pedido) setar o flag + injetar o goal com a meta extraída; (2) uma **condição de saída** explícita (TTL via `committedAt` + `config.assistGoalTtlMs`, ou `progress>=1`); (3) o `disposition` alternar para `ASSISTANT` temporariamente e reverter. O eixo `disposition` (AUTONOMOUS/ASSISTANT) e os comandos literais `!ajudante`/`!sozinho` já existem em `control/disposition.ts`.

**Trade-offs:** (+) zero estrutura nova — preempção, prioridade e histerese reusadas. (+) "volta sozinho" é emergente (sem goal de pedido, `selectGoal` cai no melhor candidato need/tech). (−) precisa parsear o pedido em chat para uma meta acionável (item/bloco) — usar o LLM (gate `chat` da deliberação) ou matching literal simples. (−) decidir reversão de disposição: por TTL ou ao concluir o pedido.

**Example:**
```typescript
// quando um pedido vira objetivo (caminho de chat / deliberação trigger:'chat')
holder.disposition = 'ASSISTANT'                    // temporário
holder.playerRequestPending = true
holder.goals.push({
  id: 'req:bring_wood', kind: 'fetch', source: 'player_request',
  priority: 1.0, progress: 0, dependsOn: [], committedAt: now,
})
// selectGoal (JÁ no código) preempta porque ASSISTANT + playerRequestPending.
// observe (JÁ no código) reseta playerRequestPending ao consumir.
// condição de saída (MOD em selectGoal/observe):
//   progress>=1  OU  now-committedAt > config.assistGoalTtlMs
//   → descarta o goal e reverte disposition='AUTONOMOUS' → volta ao curriculum sozinho
```

### Pattern 4: Grounding via captura de estado antes/depois no Execute

**What:** Toda skill retorna um `SkillResult` cujo `observation` é derivado do **estado real verificado** (delta de inventário, bloco virou ar, posição mudou) — não de uma alegação. O `execute` grava esse resultado factual na memória; o LLM, no próximo `serializeContext`, só vê o que aconteceu de verdade. Generaliza o `progressChecker` do `dig` (que já checa inventário) para um resultado factual de retorno.

**When to use:** Em TODA skill, mas crítico em craft/smelt/dig (onde nasce o "peguei 10 tábuas"). FEATURES.md classifica grounding como pré-requisito de TODA a progressão.

**Onde no fluxo Observe/Execute:**
- **Captura ANTES:** no início de `execute`, snapshot do inventário/posição relevante (ou usar o `snapshot` que `observe` já produziu no mesmo tick — é imutável e fresco).
- **Verifica DEPOIS:** após `await skill(...)`, reler o estado e computar o delta. O `SkillResult.observation` = "craftou 4 oak_planks (inventário 0→4 confirmado)" ou "craft falhou (inventário inalterado)".
- **Grava o factual:** `holder.memory = push(... result: deltaOk ? 'success':'failure', observation ...)`. O `execute` já grava success/failure — só passa a gravar o **delta verificado**, não o retorno otimista da skill.

**Trade-offs:** (+) conserta o Known Gap diretamente; alimenta a reflexão com fatos (aprendizado próprio confiável). (+) reusa o snapshot imutável do `observe`. (−) cada skill precisa declarar "o que conta como progresso" (dig=inventário, place=bloco apareceu, navigate=posição). (−) custo de uma releitura de estado por skill (barato — é leitura do `bot`, não rede).

**Example:**
```typescript
// skills/grounding.ts (NOVO)
export async function grounded<T>(
  bot: Bot, before: () => T, run: () => Promise<void>, verify: (b: T, a: T) => SkillResult,
): Promise<SkillResult> {
  const b = before()
  try { await run() } catch (e) { return { ok: false, observation: `erro: ${String(e)}` } }
  return verify(b, before())     // before() relido = "depois"; delta = verdade
}

// craft.ts — relato = inventário confirmado, nunca alegação
return grounded(bot,
  () => countItem(bot, 'oak_planks'),
  () => bot.craft(recipe, 1, table),
  (b, a) => a > b
    ? { ok: true,  observation: `craftou ${a - b} oak_planks (confirmado ${b}→${a})` }
    : { ok: false, observation: `craft não produziu oak_planks (inventário ${b}, inalterado)` })
```

### Pattern 5: LLM Provider Factory — GPT-4.1-mini e LM Studio atrás de `LlmProvider`

**What:** `createOpenAiProvider()` é irmão de `createLmStudioProvider()`, retornando a MESMA interface `LlmProvider` (decide/chat/available/embed). Ambos usam `ChatOpenAI`; divergem só em `model`/`apiKey`/`baseURL`. Um `createProvider()` despacha por `config.llmProvider`.

**Decisão do usuário:** o modelo cloud é **GPT-4.1-mini** (não gpt-5.x). É barato (~$0.40/$1.60 por 1M tok aprox.), suporta tool-calling/structured output e é adequado a um loop com gate de invocação. A tabela de gpt-5.x na STACK.md é referência de mecânica (reasoning.effort, caching), mas o provider deve usar `gpt-4.1-mini` como default cloud.

**When to use:** LM Studio permanece o default custo-zero do loop sempre-ativo; GPT-4.1-mini é opt-in por env (`LLM_PROVIDER=openai`) para reasoning mais forte em planejamento de tech tree. Roteamento por dificuldade (local na rotina, cloud na decisão importante) é evolução futura.

**Trade-offs:** (+) zero biblioteca nova; `LlmProvider` já isola tudo (LLM-03). (+) `available()`/`embed()` se adaptam (OpenAI tem endpoints reais). (−) `embed()` no provider OpenAI precisa apontar para embeddings da OpenAI OU manter embeddings sempre locais (recomendado: embeddings sempre LM Studio para custo-zero, mesmo com chat na cloud — desacoplar os dois). (−) custo no loop: manter o gate de invocação single-flight + `replanMinIntervalMs` é o que segura a fatura.

**Example:**
```typescript
// llm/provider.ts (MOD) — irmão da factory existente
export function createOpenAiProvider(): LlmProvider {
  const model = new ChatOpenAI({
    model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',   // decisão do usuário
    apiKey: process.env.OPENAI_API_KEY,                  // real
    temperature: Number(process.env.LLM_TEMPERATURE ?? 0.4),
    timeout: 20000, maxRetries: 1,
    // sem baseURL → endpoint padrão OpenAI
  })
  // decide/chat/available idênticos em forma; embed → manter LOCAL (custo-zero) ou OpenAI embeddings
  return adaptChatOpenAI(model, /* embedVia */ 'local')
}

export function createProvider(): LlmProvider {
  return config.llmProvider === 'openai' ? createOpenAiProvider() : createLmStudioProvider()
}
// loop.ts (MOD): const provider = createProvider()   // era createLmStudioProvider()
```

---

## Data Flow

### Tick com System 1 (sobrevivência) tomando precedência

```
[driver tick]
   ↓ lê lastSnapshot
decideReflex(snapshot, holder)  ── reflexo? ──► runReflex(skill grounded) ─► memory  ─┐ (pula grafo)
   │ null                                                                              │
   ▼                                                                                   │
graph.invoke():                                                                        │
  observe   : buildWorldSnapshot → needs(evaluateNeeds) → goals(generateGoals +DAG)    │
              → selectGoal(preempção: survivalCritical | ASSISTANT+request)            │
  analyze   : holder.llmDecision fresca? → cogState ; senão arbitrate() (+fighting/    │
              building) ; backoff → idle                                               │
  updateMemory : no-op (transição gravada no execute)                                  │
  decide    : (hint do goal/llmDecision)                                               │
  execute   : estado → skill (gather/explore/social + NOVO craft/build/fight) ;        │
              GROUNDED: captura antes/depois → SkillResult → memory (delta real) ──────┘
   ▼ (paralelo, não bloqueia)
maybeDeliberate(void): single-flight LLM → holder.llmDecision  ·  reflect REUSA o lock
   ▼
flush periódico (persistHolder) · reflexão (shouldReflect → maybeDeliberate trigger:'reflect')
```

### Fluxo do modo assistente (sem máquina de modos)

```
chat "traz madeira"
   ↓ conversation/parse
holder.disposition='ASSISTANT' ; playerRequestPending=true ; push Goal{source:'player_request',prio=1}
   ↓ próximo observe
selectGoal: preempta (ASSISTANT+pending) → currentGoal = pedido
   ↓ execute cumpre (gather/navigate grounded)
progress>=1  OU  committedAt+TTL expirou
   ↓ observe/selectGoal
descarta goal ; disposition='AUTONOMOUS' → volta ao curriculum need/tech SOZINHO
```

### Key Data Flows

1. **Reflexo → memória → reflexão:** uma morte/fuga reflexa vira evento grounded em `shortTerm`; a reflexão (Fase 4, já existe) consolida em LP e pode ajustar goals (`applyGoalUpdates`) — fecha o "aprendizado por experiência própria" sem componente novo.
2. **DAG → gathering:** `nextUnlockable` decide QUE bloco buscar; o `execute` do estado `gathering` (com `highestPriorityGatherTarget`/`dig`) o coleta grounded. A `gatheringLadder` flat de `config.ts` vira derivada do DAG.
3. **Grounding → serializeContext → LLM:** o `serializeContext` (deliberação) passa a ler eventos com `observation` factual; o LLM planeja sobre o que aconteceu de verdade, não sobre alucinação.
4. **Provider → embed desacoplado:** chat/decide podem ir para GPT-4.1-mini; embeddings permanecem locais (LM Studio) para manter custo-zero do KNN semântico sempre-ativo.

---

## Suggested Build Order

Dependência-dirigida. Respeita: **grounding + System 1 ANTES de progressão; building/combate DEPOIS.**

1. **LLM Provider Factory (GPT-4.1-mini + LM Studio).** Isolado, baixo risco, destrava reasoning melhor para validar o resto. `createProvider()` + `createOpenAiProvider()` + config `llmProvider`. *Marco: trocar provider por env sem tocar o loop.*
2. **Grounding + `SkillResult`.** Generaliza o padrão do `dig`; converte skills existentes (navigate/dig/follow/attack) para retorno grounded; `execute` grava delta real. **Pré-requisito de TUDO em progressão** (FEATURES.md). *Marco: relato = mundo (acaba o "peguei 10 tábuas").*
3. **System 1 reflexo — comer + fugir/defender.** `reflexes.ts` + skills `eat`/`flee` (API nativa) + precedência no driver. Detecção de mob hostil no arbiter. **Sem isto o bot morre antes de qualquer plano.** *Marco: bot não morre de fome nem de mob trivial.*
4. **Placement + abrigo de emergência.** Skill `place` (compartilhada com Building) + `shelter` reflexo (System 1). *Marco: bot se abriga à noite.*
5. **Crafting + smelting grounded.** `craft`/`smelt` na API nativa, sobre o grounding do passo 2. *Marco: craft/smelt verídicos (tábuas→bancada→ferramenta→fornalha→ferro).*
6. **Tech tree DAG + needs.** `techtree.ts` + `generateGoals`/`selectGoal` resolvendo `dependsOn`; ativar needs `shelter`. *Marco: progride madeira→pedra→ferro SOZINHO por dependências priorizadas por need.*
7. **Modo Assistente (condição de saída).** Parse de pedido → goal `player_request` + TTL + reversão de disposition. Reusa preempção existente. *Marco: atende pedido e volta sozinho.*
8. **Building deliberado** (estado `building` real, além do abrigo) — trigger: place estável. (P2)
9. **Fighting completo** (estado `fighting` real: atacar mobs, `mineflayer-tool`/armor) — trigger: sobrevivência reflexa provada. (P2)
10. **Fechar o loop de aprendizado** — reflexão (já existe) ajustando seleção de goals com mortes/falhas; resolver o live-verify pendente da Fase 4. (P2)

> **Insight crítico:** passos 1-2 não dependem de gameplay novo (provider + grounding são infra) — destravam tudo. Passos 3-4 (System 1 + abrigo) garantem que o bot **sobrevive o suficiente para que a progressão (5-6) tenha tempo de rodar.** Building/Fighting "de verdade" (8-9) são os últimos porque dependem de place (4) e de sobrevivência reflexa (3) já provados.

---

## Anti-Patterns

### Anti-Pattern 1: Criar um nó "reflect"/"survive" novo no StateGraph
**What people do:** Adicionar nós ao grafo para sobrevivência ou reflexão.
**Why it's wrong:** A reflexão JÁ reusa a deliberação single-flight (decisão D-12 do projeto), e o System 1 precisa rodar ABAIXO da latência do grafo. Um nó novo no grafo está sujeito ao tick e ao lock — perde o propósito reflexo e quebra o "uma inferência por vez".
**Do this instead:** System 1 = função pura no driver (fora do grafo). Reflexão = `trigger:'reflect'` no `maybeDeliberate` existente.

### Anti-Pattern 2: Máquina de modos paralela para autônomo/assistente
**What people do:** Um `Mode` enum separado com sua própria lógica de transição ao lado dos goals.
**Why it's wrong:** Duplica a seleção de objetivos; o "volta sozinho" vira código de transição explícito frágil. O projeto já tem `disposition` + `playerRequestPending` + preempção em `selectGoal`.
**Do this instead:** Pedido = `Goal{source:'player_request'}` de alta prioridade com condição-de-saída. Sem goal de pedido, o agente volta ao curriculum por construção.

### Anti-Pattern 3: Confiar no retorno otimista da skill (sem grounding)
**What people do:** `await craft()` resolveu → grava "craftou". O LLM relata "peguei 10 tábuas".
**Why it's wrong:** É o Known Gap atual; corrompe a memória e a tech tree (o bot "acha" que tem bancada e tenta a folha bloqueada).
**Do this instead:** Verificar delta de inventário/mundo DEPOIS; gravar só o factual (Pattern 4).

### Anti-Pattern 4: Plugins de combate/auto-eat abandonados
**What people do:** Adicionar `mineflayer-pvp`/`mineflayer-auto-eat`.
**Why it's wrong:** 4 anos sem release contra MC 1.21.4; puxam deps abandonadas; escondem a lógica que é o objeto de estudo (STACK.md).
**Do this instead:** API nativa `bot.attack`/`consume`/`craft`/`placeBlock`. Único plugin novo: `mineflayer-tool` (peer obrigatória do collectblock 1.6.0).

### Anti-Pattern 5: LLM cloud em todo tick
**What people do:** `LLM_PROVIDER=openai` e deixar o loop chamar GPT a cada tick.
**Why it's wrong:** Loop sempre-ativo × prompt grande × 24/7 estoura custo.
**Do this instead:** Manter o gate single-flight + `replanMinIntervalMs`; LM Studio default; GPT-4.1-mini só na decisão relevante; embeddings sempre locais.

### Anti-Pattern 6: Hardcodar a tech tree
**What people do:** Tabela manual de receitas no código.
**Why it's wrong:** Frágil entre versões de MC; a `gatheringLadder` flat já mostra o limite.
**Do this instead:** Derivar de `minecraft-data` (transitivo via mineflayer); resolução recursiva com guarda de profundidade.

---

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Minecraft Java 1.21.4 (local) | `bot/connection.ts` (createBot, plugins, reconexão com MESMO holder) | INTACTO. v2.0 só adiciona `loadPlugin(tool)`. API nativa craft/place/attack/furnace estável em 1.21.4. |
| LM Studio (`/v1`, local) | `createLmStudioProvider` (existe) | Default custo-zero do loop + embeddings. |
| OpenAI GPT-4.1-mini (`/v1`, cloud) | `createOpenAiProvider` (NOVO) — mesma `ChatOpenAI`, `apiKey` real, sem baseURL | Opt-in por env. Gate de invocação obrigatório (custo). |
| sqlite-vec (em `bun:sqlite`) | `holder.db` (existe) | INTACTO. Eventos grounded + embeddings (locais). |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| driver ↔ System 1 | chamada síncrona pura `decideReflex` + `runReflex` | NOVO. Precedência reflexo > plano deliberado no mesmo tick. |
| System 1 ↔ deliberação LLM | NENHUMA (System 1 não usa LLM) | Preserva o lock `inFlight` (single-flight). |
| goals ↔ techtree | `generateGoals` chama `nextUnlockable`; `Goal.dependsOn` carrega pré-reqs | MOD. `dependsOn` deixa de ser sempre `[]`. |
| skills ↔ grounding | toda skill retorna `SkillResult` via `grounded()` | MOD/NOVO. Contrato muda de `void`→`SkillResult`. |
| chat ↔ goals (assistente) | `conversation` seta `playerRequestPending` + injeta goal | MOD. Reusa preempção de `selectGoal`. |
| cognição ↔ provider | só `LlmProvider` (nunca `@langchain/openai`) | INTACTO (LLM-03). Factory despacha local/cloud. |
| nós ↔ holder | `holder` é fonte única; nós escrevem de volta | INTACTO. v2.0 escreve em campos existentes. |

## Sources

- Código real do projeto (lido 2026-06-19): `src/cognition/{loop,nodes,graph,deliberation,arbiter,state,types}.ts`, `src/motivation/{goals,types,needs}.ts`, `src/skills/{index,executor,dig}.ts`, `src/llm/provider.ts`, `src/perception/types.ts`, `src/config.ts`, `package.json` — HIGH (ground truth da arquitetura existente)
- `.planning/research/FEATURES.md` (2026-06-19) — System 1/2 (mc-agents), DAG (GITM), assistente=objetivo, grounding como pré-requisito, anti-features — HIGH
- `.planning/research/STACK.md` (2026-06-19) — API nativa cobre craft/place/attack/consume/furnace; só `mineflayer-tool` novo; provider via `ChatOpenAI`; cuidados de custo no loop — HIGH
- `.planning/PROJECT.md` — milestone v2.0, decisão provider configurável, modo autônomo default + assistente temporário — HIGH
- Decisão do usuário (milestone_context): provider cloud = GPT-4.1-mini (não gpt-5.x) — HIGH
- mc-agents (System 1/2, grounding por estado real) / GITM (DAG de pré-requisitos) — via FEATURES.md — HIGH

---
*Architecture research for: integração das capacidades v2.0 na arquitetura cognitiva existente do MineMind*
*Researched: 2026-06-19*
