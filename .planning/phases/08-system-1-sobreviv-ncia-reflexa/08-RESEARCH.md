# Phase 8: System 1 — Sobrevivência Reflexa - Research

**Researched:** 2026-06-20
**Domain:** TypeScript / Mineflayer 4.x + mineflayer-pathfinder 2.4.5 — camada reflexa sub-segundo (subsumption) sobre loop event-driven LangGraph
**Confidence:** HIGH (todas as decisões travadas D-01..D-20 foram confrontadas com o código instalado e a API real; nenhuma conflita)

## Summary

Esta fase entrega a POLÍTICA reflexa (skills eat/flee/shelter + guardas ambientais + arbitragem) sobre o MECANISMO já entregue pela 07.1 (`TriggerBus` com edge-detection/histerese + `AbortController` por skill-run no nó `execute`). A pesquisa confirmou, contra o código instalado e a API real do Mineflayer/pathfinder, que **todas as 20 decisões travadas são tecnicamente viáveis como escritas** — nenhuma conflita com a API ou o código atual. As primitivas nativas existem com as assinaturas assumidas (`bot.consume(): Promise<void>`, `bot.equip(item, dest): Promise<void>`, `bot.deactivateItem(): void`, `bot.blockAt(Vec3): Block|null`, `bot.oxygenLevel: number`, `bot.setControlState`), `GoalRunAway` **realmente não existe** (confirmado no `module.exports` de `goals.js`), e `GoalInvert(GoalFollow)` é o caminho idiomático. `pathfinder.setGoal(null)` (forçado/imediato) vs `pathfinder.stop()` (gracioso) é uma distinção real na API.

O ponto arquitetural mais sensível é o **contraste D-01 (função pura no driver, fora do StateGraph) vs. o estado real do código**: a preempção HOJE vive DENTRO do nó `execute` (`nodes.ts:257-327`) via `triggerBus.once('hostileNearby', …) → skillAbort.abort()`, não no driver `loop.ts`. O `STATE.md` (linha 85) registra explicitamente este conflito ("⚠️ Conflito com decisão prévia 'System 1 = função pura no driver fora do StateGraph' — revisitar"). **Isto NÃO é um bug a corrigir nesta fase — é a fronteira mecanismo↔política que o plano precisa endereçar conscientemente** (ver Open Questions #1).

**Primary recommendation:** Implementar System 1 em duas peças complementares — (1) uma **função pura de arbitragem** `arbitrateReflex(sensors) → {reflex, preempt, lifeCritical}` em módulo novo testável por tabela-verdade (honra D-01/D-03), e (2) a **generalização do listener de preempção** já existente em `nodes.ts` de `hostileNearby` para todos os gatilhos `lifeCritical`, usando `bot.pathfinder.setGoal(null)` no caminho de abort (D-07). As skills reflexas (eat/flee/shelter) seguem o contrato `SkillFunction ⇒ Promise<SkillResult>` existente.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions (D-01..D-20)

**Arbitragem dos reflexos**
- **D-01:** Modelo de arbitragem = **prioridade fixa por gravidade, winner-take-all** (Opção A1). System 1 = **função pura no driver** (fora do StateGraph, nunca chama LLM — preserva a decisão travada do Roadmap v2.0 / 07.1 D-03) que percorre array ordenado de guards e devolve `{ reflex, preempt }`. Redução canônica de subsumption (Brooks); determinística e testável por tabela-verdade.
- **D-02:** "vida-crítica preempta vs age só quando ocioso" = flag booleana `lifeCritical` por reflexo. `true` (lava à frente, afogamento, mob com dano iminente, vida crítica) → `skillAbort.abort()` imediato; `false` (fome, abrigo) só roda no `actionFinished`, nunca interrompendo a deliberação. Histerese, não fila — só vida-crítica preempta.
- **D-03:** Precedência = índice no array por gravidade: **perigo ambiental imediato (lava/afogamento) > mob hostil > queda iminente > fome**. Empates resolvem por ordem explícita testável. (Ordem fina refinável desde que "ambiental imediato vence".)
- **D-04:** Anti-flapping incremental: histerese de gatilho do TriggerBus é a 1ª camada. `commitmentCondition` (A2) DIFERIDA — só adotar sobre A1 SE o flapping persistir em teste ao vivo. NÃO implementar no v1.

**Primitivas de ação (API nativa Mineflayer — zero dep nova)**
- **D-05:** Comer = `bot.equip(food,'hand')` → `bot.consume()` → re-equipar o `heldItem` salvo. Seleção via `bot.inventory.items()` ∩ `mcData.foods` ordenada por `foodPoints`. Abort no meio = `bot.deactivateItem()`. PROIBIDO `mineflayer-auto-eat` (abandonado ~4 anos).
- **D-06:** Fugir = `GoalInvert(new GoalFollow(mob, R))` com `setGoal(goal, true)` (dynamic) — **não existe `GoalRunAway` nativo**. Sprint cego (vetor oposto + `setControlState`) só como *fallback* quando A* devolve `noPath`/timeout. Toda nova chamada de pathfinder herda os bounds do 999.1 (searchRadius/thinkTimeout/pré-check getPathTo).
- **D-07:** Parada da navegação reflexa usa `bot.pathfinder.setGoal(null)` (imediata/forçada), **NÃO** `bot.pathfinder.stop()` (gracioso — só para no próximo nó do caminho).
- **D-08:** Abrigo de emergência = condicional dual: cavar-e-tampar se houver bloco sólido 2 abaixo e sem perigo; pilar 1×1 se cercado em terreno plano. Usa `placeBlock` **mínimo** (robustez = Fase 9). Checar `blockAt` abaixo antes de cavar.
- **D-09:** Perigo ambiental = sensor por `physicsTick` lendo `bot.blockAt()` à frente/abaixo (lava/queda) + `bot.oxygenLevel` (afogamento → nadar p/ cima); reação = `pathfinder.setGoal(null)` + recuo. **Guarda de maior prioridade** (preempta inclusive a fuga).
- **D-10:** Cada reflexo segue o padrão das skills: `(bot, params) ⇒ Promise<SkillResult>` grounded, auto-embrulhado no estilo `executeWithSafety`.

**Limiares & histerese (ancorados nas mecânicas reais MC 1.21)**
- **D-11:** Fome — comer `enter food≤16 / exit ≥18`. Regen para em food≤17 → migrar `hungryThreshold` **6→16** em `config.ts`.
- **D-12:** Health — preempta+foge/abriga `enter health≤10 / exit ≥14`. Subir `survivalCriticalThreshold` **0.3→0.5**.
- **D-13:** Mob hostil — reação graduada por tipo: creeper `dist≤10`, melee `≤8`, ranged/skeleton `≤16`; `exit ≥14`; reusar `hostileDebounceMs=800`. (Classificar mob por tipo — `EntityInfo.kind` já existe.)
- **D-14:** Ambiente — afogamento emerge `oxygen≤6 / exit ≥14`; bloquear queda só **> 3 blocos** (`dano = blocos − 3`); lava lookahead **2 blocos** à frente.

**Fronteira fugir-vs-defender**
- **D-15:** Fuga por default + revidar reflexo SÓ se encurralado (Opção D-A2). Quando NÃO há rota de fuga viável → **1 golpe defensivo** via skill `attack` existente — sem perseguir, sem manter alvo (1-shot). Combate real = Fase 13.
- **D-16:** Predicado "estou encurralado?" = condição de arbitragem fugir/revidar. Simples e groundável (ex.: A* de fuga retornou `noPath`/timeout + vida baixa). "revidar" produz `MemEvent` grounded distinto de "fled-to-safety".

**Abrigo noturno**
- **D-17:** Abrigo dispara **só noite + ameaça (reativo)** — anoitecer sozinho NÃO abriga. Só cria abrigo de emergência quando há mob hostil próximo (ou vida crítica) à noite e sem rota de fuga. Abrigo planejado = Fase 12. (`nightFell` é contexto que agrava resposta a mob, não gatilho de abrigo isolado.)

**Retorno ao System 2 + registro grounded**
- **D-18:** Re-percebe do zero (Opção B1) — o reflexo, ao terminar, vira produtor de `actionFinished`; o driver re-percebe pela aresta-de-retorno event-driven existente. NÃO retomar a ação abortada (B2 rejeitada). Como o reflexo nunca toca o LLM, o lock `inFlight` libera pelo mesmo caminho já testado.
- **D-19:** Registrar o reflexo como `MemEvent` grounded (Opção B3, obrigatório junto do D-18) — emite `SkillResult`-like (`outcome`/`observed`/`expected`) pelo mesmo pipeline da Fase 7, derivado do efeito observado. **Debounced/coalesced** para não inundar a memória.

**Verificação (gate)**
- **D-20:** Após o System 1, um **re-teste limpo AO VIVO** deve confirmar que `[reflect]` ainda dispara (regressão B1 não pode reaparecer). Item de verificação humana da fase.

### Claude's Discretion
- Estrutura interna/nomes da função de arbitragem e dos guards, e a forma exata dos `SkillResult`-like dos reflexos.
- Mecânica fina de cada primitiva nativa (assinaturas exatas de `consume`/`equip`/`placeBlock`/`blockAt`) e a escolha condicional cavar-vs-pilar em runtime.
- Valores exatos de debounce/lookahead e a ordem fina de empate dentro do princípio de gravidade do D-03.
- O predicado exato de "encurralado" (D-16), desde que simples e groundável.

### Deferred Ideas (OUT OF SCOPE)
- **`commitmentCondition` (arbitration graph, A2)** — só adotar sobre A1 se o flapping persistir ao vivo (D-04).
- **Utility/argmax (A3)** e **Behavior Tree (A4)** — rejeitados aqui; BT reconsiderável nas Fases 9/12/13.
- **`placeBlock` robusto definitivo** — Fase 9 (aqui só placeBlock mínimo de emergência).
- **Combate real** (manter alvo, recuar, kiting, threat-scoring) — Fase 13 (aqui só fuga + 1 golpe defensivo).
- **Abrigo planejado/proativo** — Fase 12 (aqui só abrigo de emergência reativo, D-17).
- **Re-teste AO VIVO do `[reflect]`** — gate de verificação desta fase (D-20).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **SURV-01** | Come automaticamente antes da fome causar dano (reflexo, sem LLM) | `bot.consume(): Promise<void>` + `bot.equip` confirmados na API. Limiar food≤16 validado contra mecânica de regen (para em ≤17). Skill `eat` segue contrato `SkillFunction`. `lifeCritical=false` → roda no `actionFinished` (D-02). |
| **SURV-02** | Detecta mob hostil e reage (foge ou defende) em sub-segundo | `GoalInvert(GoalFollow)` confirmado existente; `GoalRunAway` confirmado ausente. `EntityInfo.kind === 'Hostile mobs'` já populado (snapshot.ts:47). Gatilho `hostileNearby` já preempta hoje (nodes.ts:261). Revidar 1-shot via `attack` stub (D-15). |
| **SURV-03** | Se abriga à noite/perigo (abrigo de emergência) | `bot.placeBlock(refBlock, faceVector): Promise<void>` + `bot.blockAt` confirmados. Edge `nightFell`/`dayBroke` já no TriggerBus (trigger-bus.ts:91-96). `bot.time.timeOfDay < 13000` = dia (já usado). D-17: só noite+ameaça. |
| **SURV-04** | Evita perigos ambientais (lava/queda/afogamento) via guardas reflexos | `bot.oxygenLevel: number` confirmado (index.d.ts:196). `bot.blockAt(Vec3)` para lava/queda lookahead. Sensor por `physicsTick` (NOVO — não existe hoje no TriggerBus; só `health`/`time`/`entitySpawn`/`entityMoved`). |
| **SURV-05** | Reflexo tem precedência sem bloquear o LLM (preempção, não fila) | `AbortController` por skill-run já existe (nodes.ts:257). `setGoal(null)` (forçado) vs `stop()` (gracioso) confirmado na API. System 1 nunca chama LLM → não compete pelo `inFlight` (deliberation single-flight intacta). |
</phase_requirements>

## Standard Stack

**Zero dependências novas.** Todas as primitivas vêm da API nativa do Mineflayer já instalado. Esta é uma fase de POLÍTICA sobre infra existente.

### Core (já instalado — versões verificadas em package.json)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| mineflayer | 4.37.1 | Primitivas de sobrevivência: `consume`/`equip`/`deactivateItem`/`blockAt`/`oxygenLevel`/`setControlState`/`placeBlock`/`attack` | API de bot Java de-facto; todas as primitivas confirmadas em `index.d.ts` |
| mineflayer-pathfinder | 2.4.5 | Fuga via `GoalInvert(GoalFollow)` + `setGoal(null)` | `GoalInvert`/`GoalFollow` confirmados em `lib/goals.js`; `setGoal`/`stop`/`getPathTo` em `index.d.ts` |
| minecraft-data | (transitiva) | `mcData.foods` para seleção de comida por `foodPoints` (D-05) | Acessível via `bot.registry` (mineflayer expõe `registry: Registry` — index.d.ts:217) |
| zod | 4.4.3 | Schemas das novas skills reflexas (padrão das skills existentes) | Já usado por navigate/dig/attack |

### Acesso ao `mcData.foods` (D-05) — caveat de implementação
A API recomendada moderna é `bot.registry` (Mineflayer expõe `registry: Registry` no objeto bot — `index.d.ts:217`). `bot.registry.foods` é um `Record<id, FoodInfo>` com `foodPoints`/`saturation`. O projeto **não** importa `minecraft-data` diretamente hoje (Grep confirmou: nenhum `import minecraftData`); o pathfinder o traz como transitiva. **Recomendação:** usar `bot.registry.foods` (não re-instanciar `require('minecraft-data')(bot.version)`), espelhando como o código já evita recarregar minecraft-data (connection.ts:101 alerta sobre o custo de recarregá-lo). Confidence: MEDIUM-HIGH — `bot.registry` está tipado; a forma exata de `foods` deve ser confirmada em runtime no primeiro uso (Open Question #3).

**Installation:** Nenhuma. `bun install` já cobre tudo.

## Architecture Patterns

### Estrutura recomendada (arquivos novos + edits)
```
src/
├── cognition/
│   ├── reflex.ts              # NOVO — arbitrateReflex() função pura + tipos ReflexSensors/ReflexDecision
│   ├── reflex.test.ts         # NOVO — tabela-verdade de arbitragem (bun:test, sem mock de bot)
│   ├── trigger-bus.ts         # EDIT — novos gatilhos lifeCritical: healthCritical/drowning/lavaAhead/fallAhead (physicsTick)
│   ├── nodes.ts               # EDIT — generalizar listener de preempção (hostileNearby → todos lifeCritical) + setGoal(null)
│   └── loop.ts                # EDIT — instanciar/cablear o System 1 ao lado do TriggerBus (se a função pura rodar no driver)
├── skills/
│   ├── eat.ts                 # NOVO — equip→consume→re-equip (D-05), grounded por delta de bot.food
│   ├── flee.ts                # NOVO — GoalInvert(GoalFollow) + setGoal(null,true); fallback sprint cego (D-06)
│   ├── shelter.ts             # NOVO — cavar-e-tampar OU pilar 1×1, placeBlock mínimo (D-08)
│   ├── index.ts               # EDIT — registrar eat/flee/shelter no skillRegistry
│   └── attack.ts              # (reusado p/ revidar 1-shot — D-15; pode precisar implementação mínima de 1 golpe)
└── config.ts                  # EDIT — flips de limiar (hungryThreshold 6→16, survivalCriticalThreshold 0.3→0.5) + novos (oxygen/fall/lava)
```

### Pattern 1: Função pura de arbitragem (D-01/D-03) — testável por tabela-verdade
**What:** Um array ordenado de guards, cada um `(sensors) → ReflexDecision | null`; o primeiro não-nulo vence (winner-take-all). Espelha exatamente o padrão já existente `highestPriorityGatherTarget` (arbiter.ts) e `arbitrate` (testado em arbiter.test.ts sem mock de bot).
**When to use:** Sempre — é o núcleo do System 1.
**Example (esboço, honra D-02/D-03):**
```typescript
// Source: padrão derivado de src/cognition/arbiter.ts (existente) + D-01/D-02/D-03
export interface ReflexSensors {
  food: number; health: number; oxygen: number
  isNight: boolean
  nearestHostile: { kind: string; name: string; distance: number } | null
  lavaAhead: boolean        // bot.blockAt à frente é lava (lookahead 2, D-14)
  fallAhead: number         // blocos de queda à frente (>3 = perigo, D-14)
  cornered: boolean         // A* de fuga deu noPath/timeout (D-16)
}
export interface ReflexDecision { reflex: 'eat'|'flee'|'shelter'|'retreatEnv'|'defend'; lifeCritical: boolean }

// ordem = gravidade (D-03): ambiental imediato > mob hostil > queda > fome
const GUARDS: Array<(s: ReflexSensors) => ReflexDecision | null> = [
  (s) => (s.lavaAhead || s.oxygen <= 6) ? { reflex: 'retreatEnv', lifeCritical: true } : null,
  (s) => hostileThreat(s) ? (s.cornered ? { reflex: 'defend', lifeCritical: true } : { reflex: 'flee', lifeCritical: true }) : null,
  (s) => (s.fallAhead > 3) ? { reflex: 'retreatEnv', lifeCritical: true } : null,
  (s) => (s.food <= 16) ? { reflex: 'eat', lifeCritical: false } : null,  // D-02: fome NÃO preempta
]
export function arbitrateReflex(s: ReflexSensors): ReflexDecision | null {
  for (const g of GUARDS) { const d = g(s); if (d) return d }
  return null
}
```
Nota: `defend` e `flee` ambos disparam por `hostileThreat`; `cornered` (D-16) decide qual. `lifeCritical` da fome é `false` (D-02) → o consumidor só roda `eat` no `actionFinished`.

### Pattern 2: Generalização da preempção (D-02/D-07/SURV-05)
**What:** O nó `execute` (nodes.ts:261-265) HOJE faz `triggerBus.once('hostileNearby', () => skillAbort.abort('hostileNearby'))`. Generalizar para registrar um listener por gatilho `lifeCritical` (`healthCritical`/`drowning`/`lavaAhead`/`fallAhead`/`hostileNearby`), e no abort chamar `bot.pathfinder.setGoal(null)` ANTES de `skillAbort.abort()` (D-07 — parada forçada imediata, não esperar o stop gracioso que a skill faz internamente).
**When to use:** Todo skill-run ativo precisa ser preemptável por vida-crítica.
**Pitfall já mapeado no código:** `nodes.ts:324` remove o listener no `finally` ANTES do `abort()` idempotente (evita listener orphan — Pitfall 6 da 07.1). A generalização deve manter esse padrão para TODOS os novos listeners (registrar N, remover N no finally).

### Pattern 3: Skill reflexa grounded (D-10/D-19)
**What:** `eat`/`flee`/`shelter` seguem `(bot, rawParams) ⇒ Promise<SkillResult>` (skills/index.ts:21). Grounding por delta REAL: `eat` mede `bot.food` antes/depois (não a resolução de `consume()`); `flee` mede distância ao mob antes/depois; `shelter` mede se ficou cercado. Auto-embrulho em `executeWithSafety` com `signal` (4° racer já suportado — executor.ts:106-117).
**Caveat de grounding:** o `GroundState` atual (grounding/types.ts) captura inventário+posição+bloco-alvo, mas **NÃO** captura `food`/`health`/`oxygen`. Para `eat` ser grounded por `bot.food`, o plano precisa OU estender `captureGroundState` com campos vitais OU as skills reflexas produzem um `SkillResult`-like derivado de leitura direta do bot (Claude's Discretion permite "forma exata dos SkillResult-like dos reflexos"). Recomendação: skills reflexas computam o próprio delta vital (ex.: `foodBefore`/`foodAfter`) sem mexer no `GroundState` genérico — menor blast radius (Open Question #2).

### Anti-Patterns to Avoid
- **Usar `pathfinder.stop()` na preempção vida-crítica:** gracioso, só para no próximo nó do caminho — latência incompatível com sub-segundo (D-07). Use `setGoal(null)`.
- **Adicionar o System 1 como nó no StateGraph:** proibido por D-01 e pela decisão travada do Roadmap v2.0. O reflexo é função pura fora do grafo.
- **Fazer o reflexo chamar o LLM ou tocar `inFlight`:** quebra SURV-05 e arrisca a regressão B1 do `[reflect]` (D-18/D-20).
- **Sensor ambiental em `entityMoved`/`time`:** lava/queda mudam por movimento do BOT, não de entidades. Precisa de `physicsTick` (NOVO no TriggerBus) — mas com guarda de frequência (é 20Hz+; ler `blockAt` a cada tick é barato mas emitir evento a cada tick não — usar edge-detection como os gatilhos existentes).
- **`mineflayer-auto-eat`:** proibido explicitamente (D-05 + REQUIREMENTS Out of Scope — abandonado ~4 anos).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Comer item | Lógica de timing de mastigação | `bot.consume(): Promise<void>` (resolve no fim do ato) | Promise oficial; resolve quando o consumo completa |
| Cancelar consumo | Detectar interrupção manual | `bot.deactivateItem(): void` | Primitiva nativa (D-05) |
| Fugir de mob | Cálculo de vetor de fuga + A* manual | `GoalInvert(new GoalFollow(mob, R))` + `setGoal(goal, true)` | Idiomático; `GoalRunAway` não existe |
| Parada forçada de navegação | Limpar path manualmente | `bot.pathfinder.setGoal(null)` | Forçado/imediato (D-07) |
| Seleção de comida | Hardcode de nomes de comida | `bot.registry.foods` ordenado por `foodPoints` | Dados do jogo, robusto a versão |
| Detecção dia/noite | Reimplementar | Edge `nightFell`/`dayBroke` já no TriggerBus | Já existe (trigger-bus.ts:91-96) |
| Classificação de mob | Lista de nomes hostis | `EntityInfo.kind === 'Hostile mobs'` | Já populado (snapshot.ts:47) |
| Abort de skill | Novo mecanismo de cancelamento | `AbortController` + `signal` (4° racer no executor) | Já existe (executor.ts:106) |

**Key insight:** O Mineflayer já fornece TODAS as primitivas de sobrevivência. O trabalho desta fase é POLÍTICA (quando/qual reflexo), não MECANISMO físico. Quase nada de código novo de baixo nível.

## Runtime State Inventory

> Fase de POLÍTICA nova (não rename/refactor), mas há migração de defaults de config com efeito em runtime.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Nenhum. `holder`/SQLite/MemorySaver guardam mente (needs/goals/memory), não limiares de config. Os novos `MemEvent` de reflexo (D-19) entram pelo pipeline existente sem migração de schema (MemEvent.action já tem `outcome`/`observed`/`expected` desde 07-03). | Nenhuma migração de dados |
| Live service config | `.env` do usuário pode sobrescrever `HUNGRY_THRESHOLD` com o valor antigo `6`. Mudar o **default** de 6→16 em config.ts NÃO altera um `.env` que fixe `HUNGRY_THRESHOLD=6`. | Documentar no plano; verificar `.env` ao vivo no D-20 |
| OS-registered state | Nenhum. | None — verificado (projeto roda via `bun start`, sem tasks/daemons OS) |
| Secrets/env vars | `HUNGRY_THRESHOLD`, `SURVIVAL_CRITICAL_THRESHOLD` já são lidos de env (config.ts:146,89). Novos: `OXYGEN_EMERGE_THRESHOLD`, `FALL_DANGER_BLOCKS`, `LAVA_LOOKAHEAD`, `HEALTH_CRITICAL_THRESHOLD`, exit-thresholds. | Adicionar leitura + validação de range em config.ts |
| Build artifacts | Nenhum. Sem compilação (Bun roda TS nativo). | None |

## Common Pitfalls

### Pitfall 1: Confundir o local da preempção (driver vs nó execute)
**What goes wrong:** D-01 diz "função pura no driver", mas a preempção física HOJE está DENTRO do nó `execute` (nodes.ts:261), não no `loop.ts`. Plan que assume tudo no driver vai duplicar ou quebrar o AbortController existente.
**Why it happens:** A 07.1 moveu a preempção para o `execute` (onde o `skillAbort` vive), mudando o modelo desde a decisão original do Roadmap. STATE.md:85 registra o conflito não resolvido.
**How to avoid:** Separar as duas responsabilidades: **(a) a DECISÃO** (arbitrateReflex — função pura, pode rodar no driver E/OU ser consultada pelo execute) e **(b) o ABORT FÍSICO** (fica no execute, onde o `skillAbort` está). A "função pura no driver" do D-01 é a arbitragem; o abort é o mecanismo já existente generalizado. Ver Open Question #1.

### Pitfall 2: Grounding de skill vital sem campo no GroundState
**What goes wrong:** `eat` precisa de delta de `bot.food`, mas `GroundState` só tem inventário/posição/bloco. `evaluateDig`/`evaluateNavigate` não servem para vitais.
**How to avoid:** Skills reflexas computam o próprio delta vital (foodBefore/foodAfter, healthBefore/healthAfter) e montam o `SkillResult` diretamente — Claude's Discretion permite a forma exata. Não force tudo pelo `evaluate*` genérico.

### Pitfall 3: Flapping de borda nos novos gatilhos
**What goes wrong:** `oxygen`/`food`/`distance` oscilam perto do limiar → reflexo dispara/cancela repetidamente.
**Why it happens:** Edge-detection só de "cruzou para baixo" sem exit-threshold separado re-arma a cada flutuação.
**How to avoid:** Histerese enter/exit dupla (D-11..D-14 já especificam: `enter≤X / exit≥Y`). Espelhar o `_lastFood`/`_wasDay` do TriggerBus (trigger-bus.ts:60-64). D-04 difere `commitmentCondition` — só adotar se persistir ao vivo.

### Pitfall 4: Regressão B1 do `[reflect]` (gate D-20)
**What goes wrong:** O System 1 muda QUANDO o lock `inFlight` da deliberação fica livre. Se um reflexo bloquear ou interferir no caminho do `.then((ran) => …)` (loop.ts:266-275), `[reflect]` para de disparar.
**Why it happens:** A reflexão roda via `maybeDeliberate(…, 'reflect')` que respeita `inFlight` single-flight. O reflexo NÃO deve tocar `inFlight` (D-18).
**Warning signs:** Ausência de log `[reflect] reflexão executada` após o System 1. **How to avoid:** Garantir que o reflexo nunca chame `maybeDeliberate`/LLM e que `actionFinished` continue sendo emitido pós-reflexo (mesmo caminho da 07.1). Re-teste AO VIVO obrigatório (D-20).

### Pitfall 5: Sensor ambiental em alta frequência sem guarda
**What goes wrong:** Ler `bot.blockAt` à frente a cada `physicsTick` (~20Hz) é OK; mas **emitir** evento a cada tick floda o consumidor.
**How to avoid:** Edge-detection: só emitir `lavaAhead`/`fallAhead` quando a condição CRUZA de falso→verdadeiro (como `hostileNearby` faz com debounce). Manter o `blockAt` barato (1-2 blocos de lookahead, não scan).

### Pitfall 6: `attack` é stub que retorna `error`
**What goes wrong:** D-15 reusa `attack` para o golpe defensivo, mas `attack.ts:20-23` é stub que SEMPRE retorna `{outcome:'error', reason:'não implementada'}`.
**How to avoid:** O "revidar 1-shot" precisa de uma implementação MÍNIMA real: `bot.attack(entity)` (confirmado na API — index.d.ts:345, retorna `void`). Um único `bot.attack` + grounding por HP do mob, sem perseguir (D-15). Isso é escopo desta fase, não Fase 13.

## Code Examples

### Comer (D-05) — verificado contra API
```typescript
// Source: mineflayer index.d.ts:302,335,341 (consume/equip/deactivateItem) + D-05
// bot.equip: (item: Item|number, dest: EquipmentDestination|null) => Promise<void>
// bot.consume: () => Promise<void>   (resolve no fim do ato)
// bot.deactivateItem: () => void     (abort no meio da mastigação)
const prevHeld = bot.heldItem  // index.d.ts:212 — Item | null, para re-equipar
const food = bot.inventory.items()
  .filter((it) => bot.registry.foods[it.type])           // ∩ mcData.foods
  .sort((a, b) => bot.registry.foods[b.type].foodPoints - bot.registry.foods[a.type].foodPoints)[0]
if (food) {
  await bot.equip(food, 'hand')
  await bot.consume()
  if (prevHeld) await bot.equip(prevHeld, 'hand')        // restaura
}
```

### Fugir (D-06) — verificado contra goals.js
```typescript
// Source: mineflayer-pathfinder lib/goals.js:302 (GoalInvert), :325 (GoalFollow) + D-06
// GoalRunAway NÃO existe — confirmado no module.exports (goals.js:477-492)
import { goals } from 'mineflayer-pathfinder'
const flee = new goals.GoalInvert(new goals.GoalFollow(mobEntity, fleeRadius))
bot.pathfinder.setGoal(flee, true)  // index.d.ts:40 — dynamic=true reavalia conforme o mob move
// fallback quando A* falha: sprint cego no vetor oposto
// const away = bot.entity.position.minus(mobEntity.position).normalize()
// bot.lookAt(...); bot.setControlState('forward', true); bot.setControlState('sprint', true)
```

### Preempção forçada (D-07) — verificado contra API
```typescript
// Source: mineflayer-pathfinder index.d.ts:40 (setGoal) vs :43 (stop) + D-07
bot.pathfinder.setGoal(null)  // FORÇADO — limpa goal e para imediatamente
// NÃO: bot.pathfinder.stop()  // gracioso — só para no próximo nó do path
```

### Sensores ambientais (D-09/D-14) — verificado contra API
```typescript
// Source: mineflayer index.d.ts:196 (oxygenLevel), :225 (blockAt) + D-14
const drowning = bot.oxygenLevel <= 6                              // emerge (4.5s margem)
const ahead = bot.entity.position.offset(...dirVec, 0, 0)          // lookahead 2 blocos
const lavaAhead = bot.blockAt(ahead)?.name === 'lava'
// queda: contar blocos de ar abaixo do alvo à frente; perigo se > 3 (dano = blocos-3)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `mineflayer-auto-eat` plugin | `bot.consume()` nativo + seleção própria | plugin abandonado ~2021 | D-05/REQUIREMENTS: usar API nativa (lógica é o objeto de estudo) |
| `mineflayer-pvp` plugin | `bot.attack(entity)` nativo 1-shot (aqui); pvp real = Fase 13 | plugin abandonado ~2021 | D-15: golpe defensivo via primitiva nativa |
| `require('minecraft-data')(version)` | `bot.registry` (já instanciado) | mineflayer 4.x | Evita recarregar minecraft-data (custo de RAM — connection.ts:101) |

**Deprecated/outdated:**
- `mineflayer-auto-eat`, `mineflayer-pvp`: abandonados ~4 anos (REQUIREMENTS Out of Scope). NÃO usar.

## Open Questions

1. **Onde exatamente roda `arbitrateReflex` — driver (loop.ts) ou nó execute (nodes.ts)?**
   - What we know: D-01 diz "função pura no driver"; a preempção física HOJE vive no `execute` (nodes.ts:261); STATE.md:85 registra o conflito como "revisitar no planejamento".
   - What's unclear: Se a arbitragem deve ser DUPLICADA (driver decide eat-when-idle; execute decide preempt) ou CENTRALIZADA (uma chamada, consumida nos dois lugares).
   - Recommendation: Manter `arbitrateReflex` como função PURA reutilizável (módulo `reflex.ts`), chamada (a) no driver para reflexos `lifeCritical=false` (eat/shelter no `actionFinished`) e (b) consultada pelo `execute` para os listeners de preempção `lifeCritical=true`. A "função pura no driver" do D-01 é satisfeita; o abort físico permanece onde o `skillAbort` está. **Decidir no planejamento** — é a fronteira que o plano DEVE endereçar.

2. **`eat` grounding: estender `GroundState` ou delta vital local?**
   - What we know: `GroundState` não tem `food`/`health`/`oxygen`; estendê-lo afeta `evaluateDig`/`evaluateNavigate`/`captureGroundState`.
   - Recommendation: Delta vital local nas skills reflexas (menor blast radius; Claude's Discretion permite). Não tocar no `GroundState` genérico.

3. **Forma exata de `bot.registry.foods` em runtime (MC 1.21.4).**
   - What we know: `bot.registry: Registry` é tipado; `foods` é um índice por item id com `foodPoints`/`saturation`.
   - What's unclear: chave exata (`it.type` numérico vs `it.name`) e nome do campo de pontos.
   - Recommendation: Confirmar no primeiro uso ao vivo (log de `Object.keys(bot.registry.foods)` + uma entrada). Baixo risco — é leitura, não escrita.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| mineflayer | todas as primitivas | ✓ | 4.37.1 | — |
| mineflayer-pathfinder | flee/preempção | ✓ | 2.4.5 | — |
| minecraft-data (via registry) | mcData.foods (D-05) | ✓ (transitiva) | bundled | hardcode lista de comidas se `registry.foods` indisponível |
| Servidor Minecraft Java 1.21.4 (offline) | re-teste AO VIVO (D-20) | requer setup humano | — | gate de verificação humana — não bloqueia código |
| LM Studio local | re-teste do `[reflect]` (D-20) | requer ligar (Developer tab) | — | gate humano; o reflexo em si não depende do LLM |

**Missing dependencies with no fallback:** Nenhuma para o CÓDIGO. O servidor MC + LM Studio são gates de VERIFICAÇÃO AO VIVO (D-20), não dependências de build/unit-test.

**Missing dependencies with fallback:** `bot.registry.foods` — se a forma divergir, fallback para lista mínima de comidas comuns (bread/cooked_*/apple) ordenada por foodPoints conhecido.

## Validation Architecture

> nyquist_validation: tratado como habilitado (config.json não lido com chave explícita; default = enabled).

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `bun test` (bun:test) — `package.json:10` `"test": "bun test"` |
| Config file | nenhum (bun test built-in; sem jest/vitest config) |
| Quick run command | `bun test src/cognition/reflex.test.ts` |
| Full suite command | `bun test` |

Padrão de teste confirmado: funções puras testadas SEM mock de bot (arbiter.test.ts, evaluate via dig.test.ts com mock mínimo `any`). `import { test, expect } from 'bun:test'`.

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SURV-01 | fome→eat só quando food≤16 e lifeCritical=false | unit (tabela-verdade) | `bun test src/cognition/reflex.test.ts` | ❌ Wave 0 |
| SURV-02 | hostile→flee, cornered→defend, por kind/distância | unit (tabela-verdade) | `bun test src/cognition/reflex.test.ts` | ❌ Wave 0 |
| SURV-03 | abrigo só noite+ameaça (D-17) | unit (tabela-verdade) | `bun test src/cognition/reflex.test.ts` | ❌ Wave 0 |
| SURV-04 | lava/oxygen/fall → retreatEnv, prioridade máxima (D-03) | unit (tabela-verdade) | `bun test src/cognition/reflex.test.ts` | ❌ Wave 0 |
| SURV-05 | precedência: ambiental>hostil>queda>fome; lifeCritical preempta | unit (tabela-verdade de ordenação) | `bun test src/cognition/reflex.test.ts` | ❌ Wave 0 |
| SURV-05 | `[reflect]` ainda dispara após System 1 | **manual AO VIVO** (D-20) | n/a — gate humano | n/a |
| (config) | flips de limiar + novos ranges validados | unit | `bun test src/config.test.ts` | ✅ (config.test.ts existe — estender) |
| eat/flee skills | retornam SkillResult; honram signal abort | unit (mock bot mínimo) | `bun test src/skills/eat.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `bun test src/cognition/reflex.test.ts` (+ o arquivo da skill tocada)
- **Per wave merge:** `bun test` (suite completa)
- **Phase gate:** `bun test` verde + re-teste AO VIVO do `[reflect]` (D-20) confirmado por humano antes de `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/cognition/reflex.test.ts` — tabela-verdade de `arbitrateReflex` (SURV-01..05) — função pura, sem mock de bot
- [ ] `src/skills/eat.test.ts` — eat retorna SkillResult + honra signal (mock bot mínimo estilo dig.test.ts)
- [ ] `src/skills/flee.test.ts` — flee usa GoalInvert/setGoal + fallback (mock pathfinder)
- [ ] Estender `src/config.test.ts` — novos limiares e flips (hungryThreshold 16, survivalCriticalThreshold 0.5, oxygen/fall/lava) e validação de range
- [ ] Framework install: nenhum — `bun test` já presente

## Sources

### Primary (HIGH confidence)
- `node_modules/mineflayer/index.d.ts` (lido) — `consume():Promise<void>` (335), `equip(item,dest):Promise<void>` (302), `deactivateItem():void` (341), `activateItem(offhand?):void` (339), `blockAt(point,extra?):Block|null` (225), `oxygenLevel:number` (196), `setControlState` (284), `attack(entity):void` (345), `placeBlock(ref,face):Promise<void>` (325), `heldItem:Item|null` (212), `registry:Registry` (217)
- `node_modules/mineflayer-pathfinder/lib/goals.js` (lido) — `GoalInvert` (302), `GoalFollow` (325); **`GoalRunAway` ausente** do `module.exports` (477-492)
- `node_modules/mineflayer-pathfinder/index.d.ts` (lido) — `setGoal(goal|null,dynamic?)` (40), `stop()` (43), `getPathTo` (21), `thinkTimeout`/`searchRadius`
- Código do projeto (lido): `src/cognition/trigger-bus.ts`, `loop.ts`, `nodes.ts`, `src/skills/index.ts`, `executor.ts`, `navigate.ts`, `dig.ts`, `attack.ts`, `src/grounding/types.ts`, `evaluate.ts`, `capture.ts`, `src/perception/types.ts`, `snapshot.ts`, `src/config.ts`, `src/bot/connection.ts`, `arbiter.test.ts`, `dig.test.ts`, `package.json`
- https://minecraft.wiki/w/Hunger (verificado) — regen inicia food≥18, para ≤17; starvation em food=0 → confirma D-11 (`enter≤16/exit≥18`)

### Secondary (MEDIUM confidence)
- `bot.registry.foods` forma exata (campo de chave/foodPoints) — tipado mas não confirmado em runtime MC 1.21.4 (Open Question #3)

### Tertiary (LOW confidence)
- Nenhuma — todas as decisões confrontadas com fonte primária (código instalado/API).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero deps novas; todas as primitivas confirmadas no `.d.ts` instalado
- Architecture: HIGH (padrões existentes) / MEDIUM (local exato da arbitragem — Open Question #1, é fronteira de design a decidir no plano)
- Pitfalls: HIGH — derivados de leitura direta do código (nodes.ts/loop.ts/grounding/attack stub)
- Limiares (D-11..D-14): HIGH — D-11 validado contra a wiki; demais ancorados em mecânica documentada

**Research date:** 2026-06-20
**Valid until:** 2026-07-20 (estável — API Mineflayer 4.x e código do projeto pinados; re-verificar se mineflayer/pathfinder forem atualizados)
