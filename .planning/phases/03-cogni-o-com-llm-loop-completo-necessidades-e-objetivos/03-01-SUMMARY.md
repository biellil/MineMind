---
phase: 03-cogni-o-com-llm-loop-completo-necessidades-e-objetivos
plan: 01
subsystem: llm
tags: [llm, lm-studio, structured-output, fallback, persona, tokenizer]
requires:
  - src/cognition/types.ts (MemEvent, CognitiveState)
  - src/perception/types.ts (WorldSnapshot)
  - src/cognition/arbiter.ts (forma do fallback determinístico — consumido pelo Plan 03)
provides:
  - "LlmProvider + createLmStudioProvider (cliente LLM atrás de interface — LLM-01/LLM-03)"
  - "ActionDecisionSchema (enum de ações FECHADO + Zod — LLM-02)"
  - "decideAction (repair/retry + fallback determinístico que nunca lança — LLM-02/D-17)"
  - "buildPersonaPrompt + serializeContext (persona estática + contexto compacto — CHAT-03)"
  - "estimateTokens via js-tiktoken o200k_base (tokenizer real — MEM-01)"
affects:
  - src/memory/shortTerm.ts (implementação interna de estimateTokens; assinatura preservada)
tech-stack:
  added:
    - "@langchain/openai@1.5.1 (ChatOpenAI -> LM Studio baseURL)"
    - "js-tiktoken@1.0.21 (encoding o200k_base)"
  patterns:
    - "Provider interface escondendo o SDK do LLM (ChatOpenAI confinado a src/llm/provider.ts)"
    - "Structured output com enum fechado + Zod parse + repair de 1 tentativa + fallback injetado"
    - "Probe de disponibilidade via fetch (timeout curto, nunca lança) para degradação graciosa"
key-files:
  created:
    - src/llm/schemas.ts
    - src/llm/prompts.ts
    - src/llm/provider.ts
    - src/llm/structured.ts
    - src/llm/schemas.test.ts
    - src/llm/structured.test.ts
  modified:
    - src/memory/shortTerm.ts
    - src/memory/shortTerm.test.ts
    - .env.example
    - package.json
decisions:
  - "Enum de ação FECHADO em ActionDecisionSchema (z.enum) — o LLM nunca escolhe ação fora do conjunto (T-03-01)."
  - "Fallback injetado por parâmetro em decideAction (módulo puro/testável; o Plan 03 passa o arbiter)."
  - "available() faz probe via fetch /models com timeout 1500ms — não usa ChatOpenAI (evita custo de inferência)."
  - "Cast de schema/resultado confinado ao provider para satisfazer a constraint RunOutput extends Record<string,any> do langchain sem vazar tipos para a cognição."
metrics:
  tasks: 3
  files_created: 6
  files_modified: 4
  commits: 3
  tests: "28 (llm + memory) / 95 (suite completa) — todos verdes"
  duration_min: ~30
  completed: 2026-06-19
---

# Phase 3 Plan 01: Fundação de LLM (Provider, Structured Output, Persona, Tokenizer) Summary

Fundação isolada de LLM da Fase 3: cliente LM Studio escondido atrás de `LlmProvider` (ChatOpenAI nunca vaza para a cognição), decisão de ação com enum FECHADO + Zod + repair + fallback determinístico que nunca trava o loop, persona estática "sobrevivente pragmático" com espelho de idioma por disposição, e o tokenizer real (js-tiktoken o200k_base) substituindo a heurística 4-chars/token na memória de curto prazo. Módulos puros/isolados, prontos para os planos de integração (03/04) plugarem no grafo.

## What Was Built

- **src/llm/schemas.ts** — `ActionDecisionSchema` (`z.enum(['gather','explore','navigate','idle','chat'])` + `target?` max 64 + `reason` max 200) e o tipo `ActionDecision`. Enum FECHADO: o LLM só escolhe ação+alvo de alto nível; params físicos de skill são validados depois pelo `toolRegistry` (D-10). — **LLM-02**
- **src/llm/provider.ts** — `interface LlmProvider { decide, chat, available }` e `createLmStudioProvider()`. `ChatOpenAI` vive SOMENTE aqui (LLM-03); `baseURL`/`apiKey: 'lm-studio'` dummy; `decide` via `withStructuredOutput(schema, { method: 'jsonSchema' })`; `available()` faz probe leve via `fetch('/models')` com timeout 1500ms e nunca lança (D-17). — **LLM-01 / LLM-03 / D-18**
- **src/llm/prompts.ts** — `buildPersonaPrompt('AUTONOMOUS'|'ASSISTANT')` (persona estática "sobrevivente pragmático", espelho de idioma D-02, disposição modula proatividade D-06/D-07) e `serializeContext(snapshot, needs, goals, recentEvents)` compacto e tolerante a null/vazios. — **CHAT-03**
- **src/llm/structured.ts** — `decideAction(provider, messages, fallback)`: probe → decide → Zod parse → repair de 1 tentativa (`repairHint`) → fallback. NUNCA lança. Fallback injetado por parâmetro. — **LLM-02 / D-17**
- **src/memory/shortTerm.ts** — `estimateTokens` agora conta tokens reais via `getEncoding('o200k_base').encode(...)`, encoding carregado 1x no escopo do módulo; assinatura e demais funções intocadas. — **MEM-01 (real)**

## Verification Results

- `bun test src/llm/ src/memory/shortTerm.test.ts` — 28/28 verdes.
- `bun test` (suite completa) — 95/95 verdes, sem regressões.
- `bunx tsc --noEmit` — limpo após a Task 2 (executado antes do bloqueio de sandbox na verificação final; a Task 3 só adiciona código já exercitado pelos testes que o Bun type-stripa e executa). Ver "Deferred Issues".
- `grep -rn "ChatOpenAI" src/ | grep -v provider.ts` — VAZIO (LLM-03 provado).
- Enum fechado presente em `src/llm/schemas.ts` (LLM-02 provado).
- `decideAction`: 1× probe `available`, 2× `fallback()`, 2× `ActionDecisionSchema.parse` (D-17 provado).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Recalibração dos testes de orçamento da memória após o novo tokenizer**
- **Found during:** Task 1
- **Issue:** O teste existente `estimateTokens = ceil(JSON.stringify(e).length / 4)` afirmava a heurística antiga (e continha a string proibida pelo acceptance criteria). Além disso, os testes de evicção FIFO usavam `budget=20`, que com a contagem real (~21 tokens/evento) evictava TODOS os eventos e quebrava (`getEvents(mem)[0]` undefined).
- **Fix:** O teste de igualdade passou a afirmar `enc.encode(JSON.stringify(e)).length` (contrato do tokenizer real); os budgets dos testes FIFO/total foram recalibrados em função de `estimateTokens(worldEvent(1))` para continuar exercitando evicção mantendo alguns eventos.
- **Files modified:** src/memory/shortTerm.test.ts
- **Commit:** 460e460

**2. [Rule 3 - Blocking] Cast de schema no provider para satisfazer a constraint do langchain**
- **Found during:** Task 2
- **Issue:** `model.withStructuredOutput<T>(...)` exige `RunOutput extends Record<string, any>`; a interface `LlmProvider.decide<T>` é genérica sem essa constraint → erro TS2344.
- **Fix:** Cast do schema para `ZodType<Record<string, unknown>>` e do resultado de volta para `T`, confinado a `src/llm/provider.ts`. A interface pública permanece genérica e nenhum tipo do langchain vaza para a cognição (preserva LLM-03).
- **Files modified:** src/llm/provider.ts
- **Commit:** b048a7c

**3. [Rule 2 - Missing config] Variáveis LLM em .env.example**
- **Found during:** Task 1
- **Issue:** `.env.example` (listado em files_modified e user_setup) não tinha as vars do LM Studio.
- **Fix:** Adicionadas `LLM_BASE_URL`, `LLM_MODEL`, `LLM_TEMPERATURE` com comentário sobre degradação graciosa (D-17).
- **Files modified:** .env.example
- **Commit:** 460e460

## Deferred Issues

- **Verificação final de `tsc --noEmit` bloqueada pelo sandbox:** após a Task 2 o typecheck rodou limpo (exit 0); durante a verificação final do plano, comandos de typecheck (`bunx tsc`, `bun run typecheck`) passaram a ser negados pelo ambiente. A Task 3 (`structured.ts`) usa apenas símbolos já tipados e validados (`HumanMessage`, `ActionDecisionSchema`, `LlmProvider`) e é exercitada pelos 6 testes que o Bun executa com type-stripping. Risco de tipo residual: baixo. Recomenda-se rodar `bun run typecheck` no merge do orchestrator (hooks são validados lá).

## Authentication Gates

Nenhum gate atingido durante a execução. **User setup necessário em runtime (não bloqueante para este plano):** habilitar o servidor do LM Studio (Developer tab → Start Server) e carregar um modelo de chat ≥ 7B com suporte a json_schema, configurando `LLM_BASE_URL`/`LLM_MODEL`. Sem isso, `available()` retorna false e o agente degrada para o arbiter determinístico (D-17) — o loop continua rodando.

## Known Stubs

- `serializeContext` tipa `needs`/`goals` como `unknown` e os serializa defensivamente (JSON truncado). Intencional: os tipos reais de necessidades/objetivos são fornecidos pelos Plans 02/03 desta fase, que conectarão os dados reais. Não impede o objetivo deste plano (fundação isolada).

## Threat Flags

Nenhuma superfície de segurança nova além do `<threat_model>` do plano. As mitigações previstas foram implementadas: enum fechado + Zod parse → fallback (T-03-01); chat de jogador entra só como contexto, ação restrita ao enum (T-03-02); `available()` com timeout curto que nunca lança (T-03-03); apiKey dummy literal/localhost (T-03-04, accept).

## Self-Check: PASSED

- Arquivos criados confirmados em disco: src/llm/schemas.ts, prompts.ts, provider.ts, structured.ts, schemas.test.ts, structured.test.ts.
- Commits confirmados: 460e460 (Task 1), b048a7c (Task 2), 3fb58bc (Task 3).
- Testes: 95/95 verdes na suite completa.
