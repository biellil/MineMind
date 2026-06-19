# Phase 3: Cognição com LLM — Loop Completo, Necessidades e Objetivos - Research

**Researched:** 2026-06-19
**Domain:** Integração de LLM local (LM Studio / OpenAI-compat) com arquitetura de agente de duas taxas; structured output com modelo fraco; motivação intrínseca (necessidades→objetivos); estado durável fora-do-bot dentro do LangGraph v1.
**Confidence:** MEDIUM-HIGH (stack/structured-output HIGH; padrões de motivação/objetivo MEDIUM — bem estabelecidos mas dependem de tuning empírico com o modelo local)

<user_constraints>
## User Constraints (from CONTEXT.md)

> Cópia verbatim das decisões travadas. O planner DEVE honrá-las. As 20 decisões D-01..D-20 estão integralmente em `03-CONTEXT.md` — abaixo o resumo acionável; em caso de dúvida, o texto de `03-CONTEXT.md` prevalece.

### Locked Decisions (D-01..D-20)

**Personalidade & Voz (CHAT-03):**
- **D-01:** Arquétipo "sobrevivente pragmático" — focado em tarefas, reservado, fala pouco e direto. Prompt base **estático** (sem evolução — Fase 4).
- **D-02:** Idioma **espelha quem fala** (na prática pt-BR). Prompt deve instruir o LLM local a detectar/casar o idioma do interlocutor.
- **D-03 (discretion):** Auto-percepção (assume IA vs roleplay) definida pelo personality prompt, sem regra rígida. Default sugerido: honesto sobre ser um agente, sem ênfase.

**Eixo de Disposição AUTONOMOUS vs ASSISTANT (visão central):**
- **D-04:** Eixo de disposição/persona **ortogonal** aos modos de controle da Fase 2. AUTONOMOUS = sobreviver sozinho (observar PoC); ASSISTANT = companheiro que ajuda jogadores. Disposição = *propósito*; controle = *freio*.
- **D-05 (discretion p/ keywords):** `.env` define default + troca em runtime por comando literal de chat (ex.: `!ajudante` → ASSISTANT, `!sozinho` → AUTONOMOUS — keywords exatas a critério do Claude, padrão literal/sem-LLM de D-09 Fase 2).
- **D-06:** O que muda entre modos: personalidade/tom, proatividade, **peso das necessidades**, aceitação de tarefas de jogadores. Camada física (skills/safety/snapshot) é idêntica.
- **D-07:** Em AUTONOMOUS o agente **praticamente ignora jogadores** — só reage a comandos de controle. Conversa coerente essencialmente desligada/mínima.

**Necessidades (NEED-01/02):**
- **D-08:** **3 necessidades ativas:** sobrevivência, recursos, curiosidade. **Abrigo e socialização entram como stub** (no enum/estrutura, sem decaimento real — espelha stub de Fighting/Building).
- **D-09:** Origem **híbrida:** sobrevivência e recursos derivam do estado real do `WorldSnapshot` (vida/fome/inventário); curiosidade decai por **timer temporal**.
- **D-10:** **Pesos equilibrados** entre as 3 ativas por padrão (não "sobrevivência domina"), ajustáveis por config; disposição (D-06) modula.
- **D-11:** **Anti-starvation (NEED-02):** necessidade ignorada cresce em prioridade ao longo do tempo. Parâmetros (decaimento, limiares) configuráveis. Substitui/estende a escada de Gathering fixa da Fase 2.

**Conversa (CHAT-01/02):**
- **D-12:** Gatilho de resposta considera **todo chat de jogador próximo** (não só endereçado). Respostas curtas (arquétipo reservado). Proatividade configurável via `.env`. Em AUTONOMOUS a conversa é mínima (D-07).
- **D-13:** Em ASSISTANT, **pedido de jogador em linguagem natural vira objetivo dinâmico** (interpretado pelo LLM → GOAL-01). **Maior superfície de falha do modelo local** → validação/restrição/fallback (LLM-02, D-17) críticos aqui. Em AUTONOMOUS pedidos **não** viram objetivos.

**Controle (Fase 2 estendida):**
- **D-14:** `!auto` adicionado ao mapa `COMMANDS` em `src/control/commands.ts` como alias do modo autônomo de **controle** (mantendo `!livre`). Parsing literal exato, sem LLM. NÃO confundir com disposição (D-05).

**Objetivos (GOAL-01/02):**
- **D-15:** **Comprometimento forte com histerese**, mas com **preempção bem definida**: só furam o comprometimento (a) sobrevivência crítica e (b) em ASSISTANT, pedido/chegada de jogador. Força/limiares configuráveis.
- **D-16:** Objetivos têm **prioridade, progresso e dependências**. Fontes: (1) necessidades que cruzam limiar (D-11); (2) pedidos de jogador em ASSISTANT (D-13).

**Duas taxas & saída restrita (COG-03, LLM-01/02/03):**
- **D-17:** **Fallback gracioso para a espinha de regra fixa da Fase 2** (arbiter + safety) quando saída do LLM for inválida/irreparável ou o LLM estiver indisponível — nunca trava nem age inseguro. Saída restrita = **enum de ações fechado + schema Zod + repair/retry + fallback**.
- **D-18:** **Cliente LLM abstraído por provedor (LLM-03):** interface de provedor com LM Studio (`@langchain/openai` → endpoint OpenAI-compat) como única implementação. Reutiliza `toolRegistry` (schemas Zod) para tool-calling.
- **D-19 (discretion):** Política de gatilho da taxa lenta + orçamento de replanejamento. **Recomendação registrada:** event-driven + intervalo mínimo configurável no `.env`, mantendo single-flight de D-02 Fase 2.

**Estado sobrevive à reconexão (CONN-03):**
- **D-20:** Estado cognitivo durável (necessidades, objetivos, memória CP, modo de controle, disposição) sai do closure por-sessão de `startCognitiveLoop` para um holder que sobrevive ao ciclo `bot.once('end')` → nova sessão. **Em-processo apenas** — NÃO antecipar `bun:sqlite`/JSON/disco (isso é Fase 4).

### Claude's Discretion
- **D-03** auto-percepção (via personality prompt).
- **D-19** gatilho da taxa lenta + orçamento de replanejamento (recomendação: event-driven + intervalo mínimo `.env`).
- Keywords exatas de disposição (`!ajudante`/`!sozinho` ou similares) e o alias `!auto`.
- Foco do modo ASSISTANT (recomendação: respeitar anti-starvation — sobrevivência crítica sempre interrompe, D-15).
- Defaults de decaimento/limiares de necessidades, teto de replanejamento, tamanhos de prompt, tokenizer real.
- **Escolha do modelo local + técnica de structured-output/tool-calling** → era explicitamente encaminhada para este research (resolvida abaixo).

### Deferred Ideas (OUT OF SCOPE)
- Persistência em disco / sobrevivência a restart do processo, memória de longo prazo, recuperação semântica (Fase 4 — MEM-02/03). CONN-03 aqui é só em-processo.
- Reflexão consolidando memória durável, perfis por jogador, personalidade evolutiva (Fase 4 — REFL-01, SOC-01/02). Personalidade aqui = prompt estático.
- Provedores de LLM em nuvem (v2 — PROV-01). Só a abstração de provedor é criada agora.
- Otimização do pathfinding da coleta (collectBlock OOM) — backlog 999.1. Workaround `PERCEPTION_RADIUS=8` permanece.
- Necessidades abrigo/socialização com lógica real — stub nesta fase.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **COG-03** | Loop em duas taxas (reativa rápida + deliberação LLM sob gatilho) com chamada LLM single-flight | "Arquitetura de Duas Taxas" + "Pattern: Deliberação fora do StateGraph" abaixo. A camada reativa = grafo da Fase 2 (mantido); deliberação = nó/serviço LLM disparado por evento, single-flight via lock booleano (estende D-02 Fase 2). |
| **CHAT-01** | Lê o chat do servidor | Já existe `bot.on('chat')` em `registerChatCommands`. Adicionar caminho conversacional separado (não-literal) ao lado do parser. |
| **CHAT-02** | Responde mensagens de jogadores de forma coerente | "Pattern: Caminho Conversacional" — chamada LLM separada da decisão de ação, com prompt de persona; `bot.chat(texto)` para responder. |
| **CHAT-03** | Personalidade base (prompt estático) | "Pattern: Personality Prompt" — system prompt estático parametrizado por disposição (D-04/D-06). |
| **LLM-01** | Raciocina/planeja via LLM local (LM Studio, OpenAI-compat) | "Standard Stack" (`@langchain/openai` 1.5.1 + `configuration.baseURL`) + "Structured Output" abaixo. |
| **LLM-02** | Saída restrita (enum + Zod + repair/fallback) tolerando modelo local | "Structured Output / Tool-Calling com Modelo Local" — recomendação `withStructuredOutput` (json_schema) + closed enum + repair + degradação ao arbiter (D-17). |
| **LLM-03** | Cliente LLM abstraído por provedor | "Pattern: Provider Interface" — interface `LlmProvider` com `LmStudioProvider` como única impl. |
| **NEED-01** | Necessidades internas que decaem/variam | "Sistema de Necessidades Intrínsecas" — modelo híbrido estado-real + timer com decaimento. |
| **NEED-02** | Necessidades influenciam estado/objetivos com anti-starvation | "Anti-starvation" — peso crescente para necessidade ignorada (urgency boost monotônico). |
| **GOAL-01** | Objetivos dinâmicos com prioridade/progresso/dependências | "Sistema de Objetivos Dinâmicos" — struct `Goal` + gerador a partir de necessidades/pedidos. |
| **GOAL-02** | Comprometimento/histerese + orçamento de replanejamento | "Comprometimento & Histerese" — guarded execution + reconsideration triggers + cooldown de replanejamento. |
| **CONN-03** | Estado cognitivo sobrevive a reconexão (em-processo) | "Estado Durável Fora-do-Bot" — holder criado 1x em `bot/index.ts`, injetado a cada sessão; integração com `thread_id` do MemorySaver. |
</phase_requirements>

## Summary

A Fase 3 acopla um LLM local fraco (LM Studio via endpoint OpenAI-compat) sobre a espinha determinística já provada da Fase 2, **sem substituí-la** — a espinha vira simultaneamente a camada reativa rápida e a rede de fallback (D-17). O risco dominante é a **não-confiabilidade da saída do modelo local**: modelos < ~7B frequentemente falham structured output e tool-calling, e o LM Studio, quando não consegue parsear um tool-call, **silenciosamente joga o texto cru em `message.content`** em vez de preencher `tool_calls` `[CITED: lmstudio.ai/docs/developer/openai-compat/tools]`. Toda a arquitetura de LLM-02 (enum fechado + Zod + repair + fallback ao arbiter) existe para domar exatamente isso.

A pilha verificada é: `@langchain/openai@1.5.1` apontado para `http://localhost:1234/v1` via `configuration.baseURL` `[VERIFIED: npm registry; CITED: docs.langchain.com]`, com `withStructuredOutput(zodSchema, { method: 'jsonSchema' })` para forçar JSON-schema-constrained decoding (LM Studio usa grammar do llama.cpp para GGUF e Outlines para MLX por baixo) `[CITED: lmstudio.ai/docs/developer/openai-compat/structured-output]`. **Importante:** o projeto já está em `@langchain/langgraph@1.4.4` e `@langchain/core@1.2.0` (v1, NÃO 0.4.x como o `research/STACK.md` previa) — APIs v1 estáveis. `@langchain/openai` e `js-tiktoken` ainda **não estão instalados**.

Os três subsistemas conceituais (necessidades intrínsecas, objetivos dinâmicos com histerese, e duas taxas single-flight) são padrões de design de agentes/IA-de-jogos bem estabelecidos `[CITED: arxiv/utility-AI surveys]`, implementáveis como módulos puros (estilo `arbiter.ts`/`safety.ts`) — o que mantém testabilidade e os deixa fora do caminho do `bot`. O estado durável (CONN-03) é uma refatoração de ownership: mover a criação de `control`/`safety`/memória/needs/goals de dentro de `startCognitiveLoop(bot)` para `bot/index.ts`, passando o holder por parâmetro.

**Primary recommendation:** Estruturar a Fase 3 como (1) provider LLM + structured output com repair/fallback, (2) módulos puros de needs/goals plugados no `analyze`/`decide` do grafo existente, (3) deliberação LLM **fora** do StateGraph (serviço event-driven single-flight que escreve no holder, lido pela camada reativa entre ticks), (4) caminho conversacional isolado no handler de chat, (5) refator de ownership do estado para sobreviver à reconexão. Sempre com o arbiter da Fase 2 como piso.

## Standard Stack

### Core (a instalar nesta fase)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@langchain/openai` | **1.5.1** | Cliente LLM/chat para LM Studio via `configuration.baseURL`; `withStructuredOutput`, `bindTools` | Drop-in OpenAI-compat; mesma família dos `@langchain/core`/`langgraph` v1 já instalados. `[VERIFIED: npm view @langchain/openai version → 1.5.1]` |
| `js-tiktoken` | **1.0.21** | Tokenizer real para substituir a heurística `estimateTokens` (~4 chars/token) de `src/memory/shortTerm.ts` | Port JS oficial do tiktoken; pure-JS (sem WASM/native — Bun-safe). `[VERIFIED: npm view js-tiktoken version → 1.0.21]` |

### Já instalado (verificado no repo)
| Library | Version (instalada) | Nota |
|---------|---------------------|------|
| `@langchain/langgraph` | **1.4.4** | **v1, não 0.4.x.** `StateGraph`, `Annotation`, `MemorySaver`, `Command`, `interrupt` exportados. `[VERIFIED: require('@langchain/langgraph/package.json').version]` |
| `@langchain/core` | **1.2.0** | v1. Fornece `tool`, mensagens, runnables. `[VERIFIED]` |
| `zod` | **4.4.3** | Zod v4 — schemas de skill já usam `.toJSONSchema()` (built-in v4). `[VERIFIED]` |
| `mineflayer` | **4.37.1** | `bot.chat(text)` para responder; `bot.on('chat')` já em uso. `[VERIFIED]` |

**Installation:**
```bash
bun add @langchain/openai@1.5.1 js-tiktoken@1.0.21
```

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `withStructuredOutput` (json_schema) | `bindTools` + closed tool set (function calling) | Tool-calling reaproveita o `toolRegistry` mais diretamente (D-18), mas com modelo fraco o LM Studio **cai pra `content`** quando o parse falha `[CITED: lmstudio tools docs]` — exige tratar ambos os caminhos. `withStructuredOutput` com schema único (action enum + params) é mais robusto p/ decisão de ação fechada. **Recomendação: usar `withStructuredOutput` para a DECISÃO (enum de ação), e os schemas Zod do `toolRegistry` para validar os params da ação escolhida.** |
| `withStructuredOutput` | JSON-mode (`response_format: { type: 'json_object' }`) sem schema | JSON-mode garante JSON válido mas **não** restringe ao schema — o modelo pode inventar campos. Inferior ao json_schema. Use só como degradação. `[CITED: litellm json_mode docs]` |
| `js-tiktoken` (cl100k/o200k) | `gpt-tokenizer` / `@xenova/transformers` | js-tiktoken é aproximação para modelos não-OpenAI (Llama usa o200k-like; erro ±3–12%) `[CITED: pkgpulse 2026]`. Para um **orçamento** de memória CP, aproximação é suficiente — não vale a complexidade de carregar o tokenizer exato do modelo. Manter js-tiktoken com `o200k_base`. |
| Deliberação dentro do StateGraph | Deliberação fora do grafo (serviço event-driven) | Ver "Architecture Patterns" — colocar a chamada LLM como um nó do grafo de tick rápido viola a separação de taxas (o tick bloquearia na inferência lenta). Recomendado: deliberação **fora**, escrevendo decisões no holder. |

**Version verification:** `@langchain/openai@1.5.1` e `js-tiktoken@1.0.21` confirmados como `latest` no npm em 2026-06-19. `@langchain/langgraph@1.4.4`/`@langchain/core@1.2.0` lidos diretamente do `node_modules` instalado. ⚠️ O `research/STACK.md`/CLAUDE.md citam LangGraph "0.4.x" e core "0.x" — **desatualizado**; o repo já migrou para v1. Planner: tratar APIs como v1.

## Architecture Patterns

### Recommended Module Structure (estende a da Fase 2)
```
src/
├── llm/
│   ├── provider.ts        # LLM-03/D-18: interface LlmProvider + LmStudioProvider (ChatOpenAI baseURL)
│   ├── schemas.ts         # LLM-02: schema Zod da DECISÃO (action enum fechado + params)
│   ├── structured.ts      # LLM-02/D-17: invoke + validate + repair/retry + fallback hook
│   └── prompts.ts         # CHAT-03/D-01..D-03: persona estática + duas taxas; idioma-espelho (D-02)
├── motivation/
│   ├── needs.ts           # NEED-01/02/D-08..D-11: módulo PURO (estilo arbiter.ts) decaimento+anti-starvation
│   └── goals.ts           # GOAL-01/02/D-15/D-16: struct Goal + gerador + histerese/preempção (puro)
├── cognition/
│   ├── deliberation.ts    # COG-03/D-19: serviço event-driven single-flight (fora do grafo)
│   ├── graph.ts           # +campos no LoopAnnotation (needs/goals/disposition); analyze/decide consultam holder
│   ├── nodes.ts           # decide passa a ler a "decisão LLM" do holder; arbiter = fallback (D-17)
│   ├── arbiter.ts         # INALTERADO — vira o fallback de D-17
│   ├── safety.ts          # INALTERADO — rede mantida sob o LLM
│   └── state.ts           # CONN-03/D-20: CognitiveStateHolder (criado fora do bot)
├── control/commands.ts    # +!auto (D-14); +disposição !ajudante/!sozinho (D-05)
├── chat/conversation.ts   # CHAT-01/02: caminho conversacional (separado do parser literal)
├── memory/shortTerm.ts    # troca estimateTokens -> js-tiktoken (real)
└── config.ts              # novos knobs .env
```

### Pattern 1: Provider Interface (LLM-03 / D-18)
**What:** Uma interface fina que esconde o `ChatOpenAI` por trás de métodos do domínio. LM Studio é a única impl agora; nuvem entra depois sem tocar a cognição.
**When to use:** Toda chamada LLM da fase passa por aqui.
```typescript
// Source: docs.langchain.com/oss/javascript/integrations/chat/openai [CITED]
import { ChatOpenAI } from '@langchain/openai'

export interface LlmProvider {
  // decisão estruturada (action enum + params) — LLM-01/02
  decide<T>(schema: ZodType<T>, messages: BaseMessage[]): Promise<T>
  // resposta livre p/ conversa — CHAT-02
  chat(messages: BaseMessage[]): Promise<string>
  available(): Promise<boolean>   // D-17: probe p/ degradar quando LM Studio off
}

export function createLmStudioProvider(): LlmProvider {
  const model = new ChatOpenAI({
    model: process.env.LLM_MODEL || 'local-model',   // nome carregado no LM Studio
    temperature: Number(process.env.LLM_TEMPERATURE ?? 0.4),
    apiKey: 'lm-studio',                              // dummy — LM Studio ignora
    configuration: { baseURL: process.env.LLM_BASE_URL || 'http://localhost:1234/v1' },
  })
  // ... decide() usa model.withStructuredOutput(schema, { method: 'jsonSchema' })
}
```
**Confidence:** HIGH (baseURL+apiKey dummy é o padrão canônico para LM Studio).

### Pattern 2: Structured Output com repair + fallback (LLM-02 / D-17)
**What:** Forçar saída ao schema; em falha, reparar; se irreparável ou LLM indisponível, **degradar ao arbiter**.
**When to use:** Toda decisão de ação guiada por LLM.
```typescript
// Schema da decisão: enum FECHADO de ações (não deixe o modelo inventar)
// Source: lmstudio.ai/docs/.../structured-output [CITED] + langchain withStructuredOutput [CITED]
const ActionDecision = z.object({
  action: z.enum(['gather', 'explore', 'navigate', 'idle', 'chat']), // enum fechado = LLM-02
  target: z.string().max(64).optional(),
  reason: z.string().max(200),
})

async function decideAction(provider, ctx, fallback): Promise<Decision> {
  if (!(await provider.available())) return fallback()        // D-17: LLM off -> arbiter
  try {
    const raw = await provider.decide(ActionDecision, ctx.messages)
    return ActionDecision.parse(raw)                          // valida Zod
  } catch (e1) {
    try {
      // repair: re-prompt curto com o erro, OU json_repair local no content cru
      const repaired = await provider.decide(ActionDecision, [...ctx.messages, repairHint(e1)])
      return ActionDecision.parse(repaired)
    } catch {
      return fallback()                                       // D-17: irreparável -> arbiter
    }
  }
}
```
**Crítico (CITED):** quando o modelo local falha o tool/structured parse, **LM Studio devolve o texto em `message.content`, não em `tool_calls`** `[CITED: lmstudio tools docs]`. Por isso preferir `withStructuredOutput` (que parseia content como JSON) a tool-calling puro, e por isso o `try/catch`→`json_repair`→fallback é obrigatório, não opcional.

### Pattern 3: Duas Taxas + Single-Flight, deliberação FORA do grafo (COG-03 / D-19)
**What:** A camada reativa = o StateGraph da Fase 2 rodando a cada tick (rápido, determinístico). A deliberação LLM roda como um **serviço separado event-driven**, single-flight, que grava sua decisão num campo do holder. O nó `decide` da camada reativa **lê** essa decisão (se fresca e válida) e a executa; senão usa o arbiter.
**Why fora do grafo:** se a inferência LLM (segundos) virasse um nó do tick, o tick rápido travaria — violando a separação de taxas. Mantendo fora, a camada reativa segue agindo/respondendo a perigo entre deliberações.
```typescript
// deliberation.ts — single-flight estende D-02 da Fase 2
let inFlight = false
let lastRunAt = 0
async function maybeDeliberate(holder, provider, trigger) {
  if (inFlight) return                                  // single-flight (D-02/D-19)
  if (Date.now() - lastRunAt < config.replanMinIntervalMs) return // orçamento de replanejamento (D-19)
  if (!shouldTrigger(trigger, holder)) return           // event-driven (D-19)
  inFlight = true
  try {
    const decision = await decideAction(provider, buildContext(holder), () => arbiterFallback(holder))
    holder.llmDecision = { ...decision, at: Date.now() } // camada reativa consome
  } finally { inFlight = false; lastRunAt = Date.now() }
}
```
**Triggers recomendados (D-19, discretion):** evento de chat (ASSISTANT), objetivo concluído/falho, necessidade cruza limiar, + teto de frequência (`replanMinIntervalMs`). Periódico só como rede.
**Confidence:** HIGH para o mecanismo (single-flight via flag já provado na Fase 2); MEDIUM para os valores de gatilho (tuning empírico).

### Pattern 4: Estado Durável Fora-do-Bot (CONN-03 / D-20)
**What:** Hoje `startCognitiveLoop(bot)` cria `control`/`safety`/grafo a cada sessão (linhas 16–18 de `loop.ts`) → reconexão zera a mente. Mover a criação do estado durável para `bot/index.ts` (criado **uma vez**) e injetá-lo em cada `startCognitiveLoop(bot, holder)`.
```typescript
// bot/index.ts — holder criado 1x, sobrevive a 'end'->nova sessão
const holder = createCognitiveStateHolder()   // needs, goals, control, safety, memory, disposition
createBot((bot) => startCognitiveLoop(bot, holder))
// loop.ts — usa holder em vez de criar do zero; grafo recompilado por sessão (bot novo),
// mas alimentado pelo estado do holder.
```
**MemorySaver/thread_id:** o checkpointer da Fase 2 vive **dentro** do grafo compilado por sessão. Para CONN-03, o estado da verdade (needs/goals/memory) deve viver no **holder**, não no checkpoint — porque o grafo é recompilado a cada reconexão. Usar `thread_id` estável (já é `'minemind-agent'`) e, na primeira invocação da nova sessão, **semear** o estado anotado a partir do holder (passar `{ memory: holder.memory, needs: holder.needs, ... }` no primeiro `invoke` em vez de `{}`). Alternativamente, tratar o holder como fonte única e usar o grafo só para o tick. **Recomendação:** holder = fonte única da verdade; grafo lê/escreve no holder via closure (como já faz com `control`/`safety`). Isso é o caminho de menor risco e evita depender da semântica de checkpoint entre grafos recompilados.
**Confidence:** HIGH (é refator de ownership; o padrão de injeção por closure já existe na Fase 2).

### Pattern 5: Caminho Conversacional separado do parser literal (CHAT-01/02/03)
**What:** O handler `bot.on('chat')` ganha DOIS caminhos isolados: (1) `parseCommand` literal existente (D-09/D-14) → muda modo; (2) se NÃO for comando, e disposição permitir (ASSISTANT, ou AUTONOMOUS com proatividade mínima), enfileira a mensagem para o caminho conversacional/deliberação.
```typescript
bot.on('chat', (username, message) => {
  if (username === bot.username) return
  const ctrl = parseCommand(message); if (ctrl) { holder.control.setMode(ctrl); return } // literal primeiro
  const disp = parseDisposition(message); if (disp) { holder.disposition = disp; return } // D-05
  // não-comando: caminho conversacional (CHAT) — só se disposição/proatividade permitir
  if (shouldRespond(holder.disposition, username, message)) enqueueConversation(holder, username, message)
})
```
Resposta via `bot.chat(resposta)`. Manter a chamada de **conversa** (texto livre, `provider.chat`) separada da chamada de **decisão de ação** (`provider.decide`) — prompts e temperatura diferentes (D-13: pedido em ASSISTANT vira objetivo via decisão, não via conversa).

### Anti-Patterns to Avoid
- **Colocar a chamada LLM como nó síncrono do tick rápido:** trava a camada reativa. Deliberação fica fora do grafo (Pattern 3).
- **Confiar em `tool_calls` do modelo local sem checar `content`:** LM Studio cai pra `content` em falha de parse `[CITED]`. Sempre validar e ter fallback.
- **Enum de ação aberto / string livre:** modelo fraco inventa ações inexistentes. **Enum fechado** (D-17/LLM-02).
- **Deixar o LLM tocar o `bot` ou montar params crus de skill:** mantém D-10 da Fase 1 — o LLM só escolhe nome de ação + alvo; o executor/skillRegistry monta a chamada física, validada pelos schemas Zod do `toolRegistry`.
- **Persistir needs/goals em disco/bun:sqlite/JSON nesta fase:** explicitamente Fase 4 (D-20). Holder é **em-memória**.
- **Trocar/quebrar o contrato `WorldSnapshot` ou `MemEvent`:** breaking change para Fase 4. Estender por adição, não por mudança.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Constrained JSON do LLM | Parser de JSON com regex/string-slicing | `withStructuredOutput(zod, { method: 'jsonSchema' })` | LM Studio aplica grammar (llama.cpp) / Outlines (MLX) por baixo `[CITED]`; LangChain já parseia/valida. |
| Reparo de JSON malformado | Lógica ad-hoc de fechar chaves | `json_repair`-style (lib pequena) ou re-prompt com erro | Casos-borda infinitos com modelo fraco; padrão documentado `[CITED: langchain discussion #21025]`. |
| Contagem de tokens | Manter a heurística 4-chars/token | `js-tiktoken` (`o200k_base`) | Heurística erra muito; tiktoken dá ±3–12% p/ modelos não-OpenAI `[CITED]`, suficiente para orçamento. |
| Cliente HTTP p/ LM Studio | `fetch` manual ao `/v1/chat/completions` | `@langchain/openai` `ChatOpenAI` + `baseURL` | Retries, streaming, parsing de tool_calls, structured-output já implementados `[CITED]`. |
| Loop/checkpoint de estado entre ticks | Novo gerenciador de estado | Holder + closure (padrão Fase 2 de `control`/`safety`) + MemorySaver existente | Já provado ao vivo na Fase 2; menos superfície nova. |
| Single-flight | Fila/mutex complexo | Flag booleana `inFlight` (como D-02 Fase 2) | O loop é sequencial single-agent; flag basta. |

**Key insight:** O valor desta fase está na **disciplina de domar um modelo fraco** (validação/repair/fallback) e no **design dos módulos de motivação**, não em reimplementar transporte LLM nem tokenização. Mantenha needs/goals como funções puras testáveis (espelhando `arbiter.ts`).

## Common Pitfalls

### Pitfall 1: Modelo local devolve tool_call no `content`, não em `tool_calls`
**What goes wrong:** Você chama `bindTools` esperando `result.tool_calls`, mas o array vem vazio e o JSON está em texto cru no `content`. O agente "não decide nada" silenciosamente.
**Why:** Modelos < ~7B / não-treinados-para-tools produzem tool-calls malformados; LM Studio então devolve o bruto no `content` `[CITED: lmstudio tools docs]`.
**How to avoid:** Preferir `withStructuredOutput` (parseia content como JSON contra o schema). Se usar `bindTools`, sempre checar `content` como segundo caminho. Sempre ter o fallback ao arbiter (D-17).
**Warning signs:** `tool_calls.length === 0` com `content` não-vazio; decisões "vazias" intermitentes.

### Pitfall 2: Estado da mente reinicia na reconexão (CONN-03 falha silenciosa)
**What goes wrong:** Após `bot.once('end')`→nova sessão, needs/goals/memória voltam ao zero porque foram criados dentro de `startCognitiveLoop`.
**Why:** É exatamente o comportamento atual da Fase 2 (D-03). CONN-03 exige mover o ownership para fora (D-20).
**How to avoid:** Holder criado em `bot/index.ts` (1x), injetado por parâmetro. Testar: simular `end`→reconnect e asserir que `holder.needs`/`goals` persistem.
**Warning signs:** Objetivos somem após uma queda de conexão; memória CP zera.

### Pitfall 3: Tick rápido bloqueia na inferência LLM
**What goes wrong:** A camada reativa para de responder a perigo enquanto o LLM "pensa" por segundos.
**Why:** Deliberação foi colocada no caminho síncrono do tick.
**How to avoid:** Deliberação fora do grafo, single-flight, escrevendo no holder (Pattern 3). A camada reativa lê a decisão pronta; nunca espera o LLM.
**Warning signs:** Ticks com latência de segundos; agente "congela" em situações que a Fase 2 resolvia rápido.

### Pitfall 4: Oscilação de objetivo (sem histerese efetiva)
**What goes wrong:** O agente troca de objetivo a cada deliberação porque o LLM/needs flutuam — anda em círculos.
**Why:** Comprometimento sem histerese/cooldown de replanejamento (GOAL-02).
**How to avoid:** Guarded execution (D-15): manter o objetivo atual a menos que dispare um *reconsideration trigger* explícito (sobrevivência crítica; em ASSISTANT, pedido de jogador). Cooldown mínimo de replanejamento (`replanMinIntervalMs`). Isto **complementa** a anti-repetição da Fase 2 (`safety.ts`), que opera em ação, não em objetivo.
**Warning signs:** Objetivo muda quase todo tick; agente vai-e-volta entre dois alvos.

### Pitfall 5: Anti-starvation ausente → necessidade eternamente preterida
**What goes wrong:** Curiosidade (ou recursos) nunca é atendida porque sobrevivência tem peso ligeiramente maior sempre.
**Why:** Prioridade estática sem urgency-boost (NEED-02/D-11).
**How to avoid:** Urgência cresce monotonicamente com o tempo desde o último atendimento da necessidade (boost configurável), garantindo que toda necessidade eventualmente vença. Pesos equilibrados por default (D-10).
**Warning signs:** O agente só faz uma coisa; uma necessidade fica saturada sem nunca virar objetivo.

### Pitfall 6: `bot.on('chat')` duplicado / disposição vaza para o parser literal
**What goes wrong:** Handlers de chat registrados múltiplas vezes (leak entre sessões) ou o caminho conversacional engole comandos literais (ou vice-versa).
**Why:** Registro fora do escopo correto; ordem errada entre parser literal e conversa.
**How to avoid:** Registrar handler 1x por sessão (handler morre com a sessão — Pitfall 5 da Fase 2 já documentado). **Ordem:** comando literal de controle → comando de disposição → conversa (Pattern 5). Em AUTONOMOUS, conversa essencialmente off (D-07).
**Warning signs:** Respostas duplicadas; `!pausar` sendo "respondido" como conversa.

## Code Examples

### Apontar ChatOpenAI ao LM Studio + structured output (LLM-01/02)
```typescript
// Source: docs.langchain.com/oss/javascript/integrations/chat/openai [CITED]
//         lmstudio.ai/docs/developer/openai-compat/structured-output [CITED]
import { ChatOpenAI } from '@langchain/openai'
import { z } from 'zod'

const llm = new ChatOpenAI({
  model: 'local-model',
  apiKey: 'lm-studio',                                   // dummy; LM Studio ignora
  configuration: { baseURL: 'http://localhost:1234/v1' },
  temperature: 0.4,
})

const Decision = z.object({
  action: z.enum(['gather', 'explore', 'navigate', 'idle', 'chat']),
  target: z.string().optional(),
  reason: z.string(),
})

const structured = llm.withStructuredOutput(Decision, { name: 'decide', method: 'jsonSchema' })
const out = await structured.invoke([
  { role: 'system', content: PERSONA_PROMPT },
  { role: 'user', content: serializeContext(snapshot, needs, goals, memory) },
])
// out já é validado contra Decision; envolver em try/catch p/ repair+fallback (D-17)
```

### Tokenizer real substituindo a heurística (MEM-01 → js-tiktoken)
```typescript
// Source: js-tiktoken README / pkgpulse 2026 [CITED]
// substitui estimateTokens em src/memory/shortTerm.ts (mantendo a assinatura)
import { getEncoding } from 'js-tiktoken'
const enc = getEncoding('o200k_base')                    // aproxima Llama/local; ±3–12%
export function estimateTokens(e: MemEvent): number {
  return enc.encode(JSON.stringify(e)).length
}
```
**Nota:** carregar o encoding 1x no módulo (não por chamada). A assinatura de `estimateTokens`/`push`/`totalTokens` permanece — troca interna apenas, sem breaking change no contrato da memória.

### Necessidade híbrida com decaimento + anti-starvation (NEED-01/02) — módulo puro
```typescript
// motivation/needs.ts — PURO (estilo arbiter.ts): lê WorldSnapshot + tempo, sem bot/LLM
export interface Need {
  kind: 'survival' | 'resources' | 'curiosity' | 'shelter' | 'social' // shelter/social = stub (D-08)
  value: number        // 0..1 (1 = totalmente satisfeita)
  lastSatisfiedAt: number
}
// híbrido (D-09): survival/resources do snapshot; curiosity por timer
export function evaluateNeeds(prev: Need[], snap: WorldSnapshot, now: number, cfg): Need[] {
  return prev.map(n => {
    let value = n.value
    if (n.kind === 'survival') value = (snap.status.health / 20 + snap.status.food / 20) / 2
    else if (n.kind === 'resources') value = resourceSatisfaction(snap.inventory, cfg)
    else if (n.kind === 'curiosity') value = Math.max(0, n.value - cfg.curiosityDecayPerMs * (now - n.lastSatisfiedAt))
    return { ...n, value }
  })
}
// anti-starvation (D-11/NEED-02): urgência = (1-value) + boost crescente com o tempo ignorado
export function urgency(n: Need, now: number, cfg): number {
  const ignoredMs = now - n.lastSatisfiedAt
  return cfg.weights[n.kind] * ((1 - n.value) + cfg.starvationBoostPerMs * ignoredMs)
}
```
**Confidence:** MEDIUM — a forma do modelo é padrão (utility AI / drives `[CITED: arxiv 2306.09445]`); os coeficientes exigem tuning empírico com o servidor real.

### Comprometimento com histerese + preempção (GOAL-02) — módulo puro
```typescript
// motivation/goals.ts
export interface Goal {
  id: string; kind: string; priority: number; progress: number   // 0..1
  dependsOn: string[]; source: 'need' | 'player_request'; committedAt: number
}
// guarded execution (D-15): mantém o objetivo atual, salvo gatilho de reconsideração
export function selectGoal(current: Goal | null, candidates: Goal[], ctx, cfg): Goal | null {
  const preempt = ctx.survivalCritical                                  // (a) sobrevivência crítica
    || (ctx.disposition === 'ASSISTANT' && ctx.playerRequestPending)    // (b) pedido de jogador (D-13)
  if (current && !preempt) {
    const best = bestCandidate(candidates)
    // histerese: só troca se o melhor superar o atual por uma margem (não por empate)
    if (!best || best.priority < current.priority + cfg.hysteresisMargin) return current
  }
  return bestCandidate(candidates) ?? current
}
```
**Confidence:** MEDIUM-HIGH — guarded execution + reconsideration triggers é o padrão canônico de comprometimento `[CITED: arxiv 2602.10479 / 2512.09458]`.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `@langchain/langgraph` 0.4.x / core 0.x (previsto no STACK.md) | **v1: langgraph 1.4.4 / core 1.2.0** (já instalado) | Repo migrou antes da Fase 3 | Planner usa APIs v1 (`StateGraph`, `Annotation`, `Command`, `interrupt`); ignorar a versão "0.x" do CLAUDE.md/STACK.md. |
| JSON-mode (só JSON válido) | **json_schema structured output** (grammar-constrained) | OpenAI structured outputs + LM Studio adotou | Restringe ao schema, não só a "JSON" — essencial p/ modelo fraco. `[CITED]` |
| Tool-calling como único caminho de ação | Structured output (enum fechado) p/ decisão + tools p/ validação de params | — | Mais robusto quando o LM Studio cai pra `content`. `[CITED]` |
| Heurística 4-chars/token | `js-tiktoken` real | Fase 3 (planejado) | Orçamento de memória CP confiável antes de o LLM consumir contexto. |

**Deprecated/outdated:**
- Referências a LangGraph 0.4.x / `@langchain/core` 0.x no `research/STACK.md` e CLAUDE.md — o repo está em v1. `[VERIFIED: node_modules]`
- `sqlite-vss` (no STACK.md) — irrelevante nesta fase (embeddings/persistência = Fase 4).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | O modelo local escolhido será ≥ 7B e suportará structured output/tool-calling de forma minimamente confiável | Structured Output | Se < 7B ou não treinado p/ tools, structured output falha muito → o fallback ao arbiter (D-17) vira o caminho dominante e o "raciocínio LLM" (LLM-01) fica fraco. **Mitigação:** validar empiricamente; D-17 garante que nunca trava. Modelo é discretion do usuário — confirmar antes de tunar. |
| A2 | `withStructuredOutput(..., { method: 'jsonSchema' })` é suportado pelo `@langchain/openai@1.5.1` contra o endpoint do LM Studio | Standard Stack | Se o método exato divergir na v1.5.1, pode ser preciso `method: 'functionCalling'` ou `jsonMode`. **Mitigação:** os três métodos existem; testar qual o LM Studio aceita melhor no spike inicial. |
| A3 | `o200k_base` é aproximação adequada do tokenizer do modelo local p/ orçamento de memória | Code Examples | Erro de contagem ±3–12% → orçamento de tokens levemente impreciso (não-crítico p/ um buffer FIFO). Baixo risco. |
| A4 | Holder em-memória + closure é suficiente p/ CONN-03 sem mexer no checkpoint do MemorySaver entre grafos recompilados | Pattern 4 | Se o planner preferir reusar o checkpoint, precisa garantir semântica de thread_id entre grafos recompilados (mais frágil). **Recomendação:** holder como fonte única — menor risco. |
| A5 | Valores de decaimento/limiares/histerese/replan-interval precisarão de tuning empírico, não há "número certo" de literatura | Necessidades/Objetivos | Defaults ruins → oscilação ou letargia. **Mitigação:** todos configuráveis via `.env` (já é o desejo do usuário); começar conservador (replan lento, histerese alta). |

## Open Questions (RESOLVED)

> Todas as três questões abertas foram resolvidas e as decisões já estão refletidas nos planos de execução (Plan 01 e Plan 04). Marcadores `RESOLVED` inline abaixo.

1. **Qual modelo local exatamente?** (discretion do usuário, encaminhado a este research mas é decisão de produto)
   - What we know: precisa suportar structured output → ≥ 7B recomendado pelo LM Studio `[CITED]`; pt-BR razoável (D-02 espelha idioma).
   - What's unclear: o modelo específico instalado no LM Studio do usuário (nome em `LLM_MODEL`).
   - Recommendation: parametrizar via `.env` (`LLM_MODEL`); no spike inicial, testar 1 modelo ~7–8B instruct com bom suporte a tools/JSON (ex.: família Qwen/Llama-instruct) e confirmar structured output antes de tunar needs/goals.
   - **RESOLVED:** o modelo é parametrizado por `.env` via `LLM_MODEL` (default `local-model`), exatamente como adotado no Plan 01 (`createLmStudioProvider`) e no Plan 03 (`config.llmModel`). A escolha do modelo específico permanece discretion do usuário (passo de `user_setup`/checkpoint), mas o código não fica acoplado a nenhum modelo — qualquer modelo ≥ 7B com structured output serve.

2. **`method` do withStructuredOutput que o LM Studio honra melhor?**
   - What we know: existem `jsonSchema`, `functionCalling`, `jsonMode`; LM Studio suporta `response_format.json_schema` e `tools` `[CITED]`.
   - What's unclear: qual dá menos falhas com o modelo escolhido.
   - Recommendation: spike A/B no início do plano; default `jsonSchema`, fallback documentado p/ `jsonMode`.
   - **RESOLVED:** default `jsonSchema` adotado no Plan 01 Task 2 (`withStructuredOutput(schema, { name: 'decide', method: 'jsonSchema' })`). O fallback documentado para `jsonMode`/`functionCalling` permanece como nota de spike (Assumption A2); a rede de segurança real é o repair/retry + fallback determinístico ao arbiter (LLM-02/D-17 no Plan 01 Task 3), que cobre qualquer método que o modelo honre mal.

3. **Pedido de jogador → objetivo (D-13): quão estruturada a extração?**
   - What we know: é a maior superfície de falha (D-13). Deve ser enum fechado + Zod + fallback.
   - What's unclear: granularidade do objetivo extraível (ex.: "coletar madeira" mapeia limpo; "constrói uma casa" não — building é stub).
   - Recommendation: restringir o objetivo extraído a um conjunto fechado de tipos suportados (gather/follow/navigate); pedidos fora do conjunto → resposta conversacional educada ("não consigo isso ainda"), nunca objetivo inválido.
   - **RESOLVED:** conjunto fechado `SUPPORTED_REQUEST_KINDS = ['gather','follow','navigate']` adotado no Plan 04 Task 2 (`src/chat/conversation.ts`). Pedidos fora do conjunto → resposta conversacional educada via persona, nunca objetivo inválido. Extração por heurística literal de palavra-chave (pt/en) restrita a esse conjunto.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| LM Studio server (`/v1`) | LLM-01/02, CHAT-02 | ✗ (não verificável neste host headless) | — | **D-17: degradar ao arbiter da Fase 2** (loop segue rodando sem LLM) |
| Modelo local carregado no LM Studio | LLM-01/02 | ✗ (depende da máquina do usuário) | — | D-17 fallback determinístico |
| `@langchain/openai` | LLM-01/02/03 | ✗ (a instalar) | 1.5.1 | `bun add` |
| `js-tiktoken` | MEM-01 (tokenizer real) | ✗ (a instalar) | 1.0.21 | manter heurística como degradação |
| `@langchain/langgraph` / `core` | COG-03, grafo | ✓ | 1.4.4 / 1.2.0 | — |
| `zod` | LLM-02, schemas | ✓ | 4.4.3 | — |
| `mineflayer` (`bot.chat`) | CHAT-02 | ✓ | 4.37.1 | — |
| Servidor Minecraft Java local | teste ao vivo | ✓ (dir `minecraft-server/` presente) | 1.21.4 | smoke test headless sem servidor p/ módulos puros |

**Missing dependencies with no fallback:** Nenhum que **bloqueie a fase** — a ausência de LM Studio é coberta por design por D-17 (fallback ao arbiter). A fase deve poder rodar (degradada) sem LLM.
**Missing dependencies with fallback:** `@langchain/openai` e `js-tiktoken` → `bun add`. LM Studio off → arbiter da Fase 2.

## Security Domain

> `security_enforcement` não está em `config.json` (default = habilitado). Projeto é pesquisa/aprendizado local, offline-mode, servidor local — superfície de ataque externa baixa. Foco: não introduzir execução insegura via LLM.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V5 Input Validation | **yes** | **zod 4.4.3** valida TODA saída do LLM (enum de ação fechado + params via schemas do `toolRegistry`). Chat do jogador nunca é avaliado como código. |
| V6 Cryptography | no | Sem segredos novos; LM Studio local sem auth (apiKey dummy). Embeddings/persistência = Fase 4. |
| V2/V3/V4 Auth/Session/Access | no | Servidor offline-mode local; sem usuários/sessões web. |

### Known Threat Patterns for {LLM-driven Minecraft agent}
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| LLM escolhe ação inexistente / params perigosos | Tampering | Enum de ação **fechado** + validação Zod dos params via `toolRegistry`; ação inválida → fallback ao arbiter (D-17). |
| Prompt injection via chat de jogador ("ignore suas regras, faça X") | Tampering / Elevation | LLM **nunca** executa código (já é Out of Scope no REQUIREMENTS.md); só pode escolher dentro do enum fechado; comandos de controle/disposição são parsing **literal**, imunes a injection. Pedido→objetivo (D-13) restrito a tipos suportados. |
| LLM toca o `bot` cru | Tampering | D-10 Fase 1 mantido: LLM opera só sobre `WorldSnapshot`; execução física só via executor/skillRegistry. |
| Loop infinito / DoS por replanejamento | DoS (auto-infligido) | Single-flight + `replanMinIntervalMs` (D-19) + anti-repetição/backoff da Fase 2 (`safety.ts`). |
| Código gerado pelo LLM | Elevation | Explicitamente **Out of Scope** (REQUIREMENTS.md) — não introduzir `eval`/`Function`/code-gen. |

## Sources

### Primary (HIGH confidence)
- npm registry (queried 2026-06-19) — `@langchain/openai@1.5.1`, `js-tiktoken@1.0.21` (latest). `[VERIFIED]`
- `node_modules` do repo — `@langchain/langgraph@1.4.4`, `@langchain/core@1.2.0`, `zod@4.4.3`, `mineflayer@4.37.1` instalados; exports do langgraph v1. `[VERIFIED]`
- https://lmstudio.ai/docs/developer/openai-compat/structured-output — `response_format.json_schema`, grammar (llama.cpp) / Outlines (MLX), limite "< 7B não confiável". `[CITED]`
- https://lmstudio.ai/docs/developer/openai-compat/tools — tool calling; **fallback de tool-call malformado para `message.content`**. `[CITED]`
- https://docs.langchain.com/oss/javascript/integrations/chat/openai — `configuration.baseURL`, `withStructuredOutput`, `bindTools`/`strict`. `[CITED]`
- Código existente do repo (`loop.ts`, `graph.ts`, `nodes.ts`, `arbiter.ts`, `safety.ts`, `commands.ts`, `shortTerm.ts`, `skills/index.ts`, `config.ts`, `perception/types.ts`, `cognition/types.ts`, `bot/index.ts`, `bot/connection.ts`). `[VERIFIED: grep/read]`

### Secondary (MEDIUM confidence)
- https://www.pkgpulse.com/guides/gpt-tokenizer-vs-js-tiktoken-vs-xenova-transformers-llm-2026 — js-tiktoken como aproximação p/ Llama (`o200k_base`, erro ±3–12%).
- https://github.com/langchain-ai/langchain/discussions/21025 — padrão json_repair p/ JSON malformado de modelos locais.
- https://arxiv.org/pdf/2306.09445 — Utility-theory cognitive modeling (drives/necessidades/seleção).
- https://arxiv.org/html/2507.19725v1 — Efeito de motivação intrínseca em comportamento de agentes.
- https://arxiv.org/pdf/2602.10479 / https://arxiv.org/pdf/2512.09458 — guarded execution / commitment / reconsideration triggers em agentic AI.

### Tertiary (LOW confidence — validar empiricamente)
- Defaults numéricos de decaimento/histerese/replan-interval — sem fonte canônica; tuning com o servidor real (A5).
- Escolha exata do `method` do withStructuredOutput p/ o modelo do usuário (A2) — spike no início do plano.

## Metadata

**Confidence breakdown:**
- Standard stack & versões: HIGH — verificado em npm + node_modules.
- Structured output / LM Studio: HIGH — docs oficiais do LM Studio e LangChain.
- Integração de duas taxas / single-flight / CONN-03: HIGH — estende padrões já provados ao vivo na Fase 2.
- Necessidades / objetivos / histerese: MEDIUM — formas padrão da literatura, mas coeficientes exigem tuning empírico.
- Confiabilidade do modelo local específico: LOW-MEDIUM — depende do modelo que o usuário carregar (A1); D-17 garante robustez independentemente.

**Research date:** 2026-06-19
**Valid until:** ~2026-07-19 (stack estável; LM Studio/LangChain v1 evoluem rápido — reverificar `method` de structured output e versões se passar de 30 dias).
