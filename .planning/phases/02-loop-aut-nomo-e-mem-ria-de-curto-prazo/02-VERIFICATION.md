---
phase: 02-loop-aut-nomo-e-mem-ria-de-curto-prazo
verified: 2026-06-19T00:00:00Z
status: passed
score: 4/4 must-haves verificados
overrides_applied: 0
re_verification: # Não — verificação inicial
---

# Fase 2: Loop Autônomo e Memória de Curto Prazo — Relatório de Verificação

**Goal da Fase:** Um loop cognitivo cíclico real, implementado como `StateGraph` do LangGraph com aresta de retorno, roda continuamente com nós de regra fixa (sem LLM) — provando a arquitetura central com zero incerteza de raciocínio. A disciplina de execução de ações (camada centralizada, rechecagem de pré-condições) e a memória de curto prazo limitada guardam o loop desde o instante em que ele começa a agir de forma contínua.
**Verificado:** 2026-06-19
**Status:** passed
**Re-verificação:** Não — verificação inicial

## Conquista do Goal

### Verdades Observáveis (Success Criteria do ROADMAP)

| # | Verdade | Status | Evidência |
|---|---------|--------|-----------|
| 1 | O loop cíclico (Observe → Analyze → Update Memory → ... → Execute → repete) roda sozinho sem parar, alternando entre estados básicos (Idle, Exploring/Gathering) por regras fixas | ✓ VERIFIED | `graph.ts`: StateGraph finito-por-tick (START→observe→analyze→updateMemory→decide→execute→END) + `loop.ts` driver externo `while(alive){ graph.invoke(...) }`. Smoke test prova 26 invokes (>recursionLimit 25) SEM `GraphRecursionError`. `arbitrate()` escolhe estado por prioridade fixa. Checkpoint humano (aprovado 2026-06-19) confirmou alternância exploring→gathering→socializing ao vivo |
| 2 | O agente vagueia/coleta de forma autônoma e visível usando os skills da Fase 1, sem qualquer chamada a LLM | ✓ VERIFIED | Zero import de LLM em `src/cognition/`. `execute` mapeia estado→skill (`navigate`/`dig`) via `skillRegistry` + `executeWithSafety` (Fase 1). Logs `[loop] estado=... OK navigate {...}` visíveis no smoke test. Checkpoint humano confirmou movimento/coleta autônomos sem LM Studio rodando |
| 3 | O loop detecta repetição de ações e ausência de progresso, evitando oscilar ou travar num mesmo comportamento | ✓ VERIFIED | `safety.ts`: `recordAttempt`/`shouldAbandon` (anti-repetição N=3, D-10) + `recordFailure`/`shouldFallbackToIdle` (backoff M=3, D-11) + `cooledDownTargets` (cooldown). Fiado em `nodes.ts` (analyze exclui cooldown + fallback Idle; execute abandona após N). `executeWithSafety` (ACT-03) provê watchdog/timeout sem recriação. `safety.test.ts` cobre todos os limiares |
| 4 | A memória de curto prazo mantém um buffer limitado (ring buffer) dos eventos/ações recentes, com esqueleto de orçamento de tokens já presente antes do LLM existir | ✓ VERIFIED | `shortTerm.ts`: `push` com evicção FIFO enquanto `total > budget` (orçamento de tokens estimado via `JSON.stringify(e).length / 4`). Fiado no nó `execute` (grava action/success|failure). Smoke test prova `memory.events.length > 0` acumulando entre ticks via MemorySaver + thread_id. `shortTerm.test.ts` cobre evicção FIFO |

**Score:** 4/4 verdades verificadas

### Artefatos Requeridos

| Artefato | Esperado | Status | Detalhes |
|----------|----------|--------|----------|
| `src/cognition/types.ts` | Contratos CognitiveState/ControlMode/MemEvent | ✓ VERIFIED | Três tipos exportados; sem import de mineflayer (tipos puros) |
| `src/memory/shortTerm.ts` | Ring buffer + orçamento de tokens (MEM-01) | ✓ VERIFIED | `createMemory`/`push`/`estimateTokens`/`totalTokens`/`getEvents`; FIFO `length / 4` |
| `src/control/commands.ts` | Modo de controle + parser literal de chat | ✓ VERIFIED | `parseCommand` lookup literal em `Object.freeze`; `bot.on('chat')` ignora a si mesmo; sem eval/Function |
| `src/cognition/arbiter.ts` | Arbitragem prioridade fixa + escada Gathering | ✓ VERIFIED | `arbitrate`/`highestPriorityGatherTarget`/`hasNearbyPlayer`; funções puras |
| `src/cognition/safety.ts` | Anti-repetição + backoff (COG-04) | ✓ VERIFIED | `recordFailure`/`recordSuccess`/`shouldAbandon`/`shouldFallbackToIdle`/`cooledDownTargets` |
| `src/config.ts` | Config do loop estendida | ✓ VERIFIED | `gatheringLadder`/`minTickMs`/`antiRepeatN`/`backoffM`/`socialRadius`/`memoryTokenBudget` + validações; campos da Fase 1 preservados |
| `src/cognition/nodes.ts` | Nós observe/analyze/updateMemory/decide/execute | ✓ VERIFIED | `createNodes(deps)` com bot/control/safety por closure (Pitfall 3 evitado); single-flight; usa `executeWithSafety` |
| `src/cognition/graph.ts` | StateGraph + MemorySaver | ✓ VERIFIED | `Annotation.Root`, `addEdge('execute', END)` (sem self-loop, Pitfall 1), `compile({ checkpointer: new MemorySaver() })` |
| `src/cognition/loop.ts` | Driver externo single-flight + stop-on-disconnect | ✓ VERIFIED | `startCognitiveLoop` com `while(alive)`, `graph.invoke`, `bot.once('end')` |
| `src/bot/index.ts` | onBotReady inicia o loop | ✓ VERIFIED | Importa e chama `startCognitiveLoop(bot)`; demo da Fase 1 removida |
| `src/cognition/loop.smoke.test.ts` | Smoke multi-tick headless | ✓ VERIFIED | 26 ticks sem GraphRecursionError; acúmulo de memória; paused→idle |

### Verificação de Key Links

| De | Para | Via | Status | Detalhes |
|----|------|-----|--------|----------|
| `loop.ts` | `graph.invoke` | driver externo re-invoca por tick | ✓ WIRED | `loop.ts:37` `await graph.invoke({}, cfg)` confirmado por leitura direta (a ferramenta gsd reportou falso-negativo por escape duplo do regex no JSON) |
| `nodes.ts` | `executeWithSafety + skillRegistry` | execute chama 1 skill via executor centralizado | ✓ WIRED | gsd verify: "Pattern found in source" |
| `bot/index.ts` | `startCognitiveLoop + registerChatCommands` | onBotReady fia loop por sessão | ✓ WIRED | gsd verify: "Pattern found in source" |
| `commands.ts` | `bot.on('chat')` | match literal → setMode | ✓ WIRED | `commands.ts:48` handler registrado, ignora `bot.username` |
| `arbiter.ts` | `config.gatheringLadder` | percorre escada × nearbyBlockTypes | ✓ WIRED | `arbiter.ts:18` itera `config.gatheringLadder` |
| `connection.ts` | `mineflayer-collectblock` | loadPlugin para o dig/Gathering | ✓ WIRED | `connection.ts:6,33` plugin importado e carregado (correção do TypeError, commit be643d3) |

### Data-Flow Trace (Nível 4)

| Artefato | Variável | Fonte | Produz Dados Reais | Status |
|----------|----------|-------|--------------------|--------|
| nó `execute` (nodes.ts) | `memory.events` | `push(memory, {action...})` após `executeWithSafety` real | Sim — eventos gravados a cada skill executada | ✓ FLOWING |
| nó `observe` (nodes.ts) | `snapshot` | `buildWorldSnapshot(bot)` (Fase 1, lê bot vivo) | Sim — snapshot do mundo real do bot | ✓ FLOWING |
| nó `analyze` (nodes.ts) | `cogState` | `arbitrate(snapshot, mode, excluded)` | Sim — derivado do snapshot + modo de controle | ✓ FLOWING |

### Behavioral Spot-Checks

| Comportamento | Comando | Resultado | Status |
|---------------|---------|-----------|--------|
| Loop multi-tick sem recursion error | `bun test loop.smoke.test.ts` | 3 pass / 0 fail (26 ticks) | ✓ PASS |
| Suíte de unidade da fase | `bun test` (cognition/memory/control) | Testes da Fase 2 verdes | ✓ PASS |
| Typecheck | `bun run typecheck` | exit 0 | ✓ PASS |
| Autonomia ao vivo + controle de chat | checkpoint humano (servidor MC local) | Aprovado pelo usuário 2026-06-19 | ✓ PASS (humano) |

### Cobertura de Requisitos

| Requisito | Plano-Fonte | Descrição | Status | Evidência |
|-----------|-------------|-----------|--------|-----------|
| COG-01 | 02-03, 02-04 | Loop cognitivo cíclico funciona | ✓ SATISFIED | graph.ts + loop.ts driver externo; smoke test 26 ticks; checkpoint humano |
| COG-02 | 02-02, 02-03 | Estados cognitivos (Idle/Exploring/Gathering/Socializing; Fighting/Building stub) | ✓ SATISFIED | arbiter.ts prioridade fixa; states.ts PRIORITY_ORDER + STUB_STATES; checkpoint confirmou transições |
| COG-04 | 02-02, 02-03 | Detecta repetição de ações e progresso, evita oscilação/travamento | ✓ SATISFIED | safety.ts anti-repeat/backoff/cooldown; executeWithSafety watchdog |
| MEM-01 | 02-01, 02-03 | Memória de curto prazo com orçamento de tokens | ✓ SATISFIED | shortTerm.ts ring buffer FIFO; smoke test acúmulo entre ticks |

Cobertura: todos os 4 IDs de Phase 2 (COG-01, COG-02, COG-04, MEM-01) declarados nos planos e mapeados em REQUIREMENTS.md. Nenhum requisito órfão.

### Anti-Padrões Encontrados

| Arquivo | Linha | Padrão | Severidade | Impacto |
|---------|-------|--------|------------|---------|
| `src/config.test.ts` | 10 | Teste de default `perceptionRadius === 32` falha (recebe 8) | ℹ️ Info | Falha causada pelo `.env` local gitignored (PERCEPTION_RADIUS=8, mitigação de OOM) que o Bun auto-carrega; NÃO é defeito de código da Fase 2. Em checkout limpo/CI (sem `.env`) o teste passa — daí o relato 75/75. Teste de config da Fase 1, não artefato da Fase 2 |

Nenhum anti-padrão bloqueador. Sem TODO/FIXME/placeholder, sem `eval`/`new Function` no parser, sem `setInterval`/`Promise.race` recriados em nodes.ts (reusa `executeWithSafety`), sem `bot` no estado anotado (Pitfall 3 evitado), sem self-loop no grafo (Pitfall 1 evitado).

### Verificação Humana Necessária

Nenhuma pendente. O checkpoint humano ao vivo (Plano 02-04, Task 2) JÁ ocorreu e foi aprovado pelo usuário em 2026-06-19: agente conectado ao servidor MC local rodando o loop sem LLM, transições de estado autônomas observadas, comandos `!pausar`/`!livre`/`!vem` verificados e frase comum (`ola`) corretamente ignorada.

### Limitação Conhecida (não bloqueia o GOAL)

O skill `dig`/gathering (skill ACT-02 da Fase 1) tem problema de robustez de memória (OOM via pathfinder do collectBlock em raio de percepção alto), mitigado localmente com PERCEPTION_RADIUS=8. Rastreado como todo pendente (`.planning/todos/pending/gathering-collectblock-oom.md`). Avaliação: NÃO bloqueia o GOAL da Fase 2 — o loop cognitivo (perceber→decidir→agir), os nós de regra fixa, a memória de curto prazo limitada e a execução de ações centralizada estão todos provados e funcionais. É uma questão de robustez de um skill da Fase 1, não da arquitetura do loop. A correção de carregamento do plugin collectblock (connection.ts, commit be643d3) já foi aplicada.

### Resumo de Gaps

Nenhum gap. Os 4 Success Criteria do roadmap estão verificados por código + teste de unidade + smoke test multi-tick + checkpoint humano ao vivo aprovado. A arquitetura central (StateGraph finito-por-tick + driver externo como aresta de retorno, nós de regra fixa sem LLM, memória de curto prazo limitada por orçamento de tokens, execução de ação centralizada com anti-repetição/backoff/watchdog) está comprovadamente operacional. A única falha de teste (config default perceptionRadius) é um artefato do ambiente local (.env de mitigação gitignored), não um defeito da Fase 2.

---

_Verificado: 2026-06-19_
_Verificador: Claude (gsd-verifier)_
