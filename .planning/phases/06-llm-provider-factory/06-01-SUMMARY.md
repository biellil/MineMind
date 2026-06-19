---
phase: 06-llm-provider-factory
plan: 01
subsystem: llm
tags: [llm, provider, openai, embeddings, config, structured-output]
requires:
  - "src/llm/provider.ts: LlmProvider interface + createLmStudioProvider"
  - "src/config.ts: tipado env + validação de boot"
provides:
  - "createOpenAiProvider(): caminho cloud GPT-4.1-mini selecionável por env"
  - "createLocalEmbedder(): embed local reutilizável (embeddings nunca vão à cloud)"
  - "createProvider(): factory de seleção local/openai por LLM_PROVIDER"
  - "decideWithFallback() / D-16: blindagem z.toJSONSchema contra caveat zod v4"
  - "config.llmProvider/openaiApiKey/openaiModel/openaiMaxTokens/openaiReasoningEffort"
affects:
  - "src/cognition/loop.ts (futuro: trocar createLmStudioProvider() por createProvider() — fora do escopo deste plano)"
tech-stack:
  added: []
  patterns:
    - "Composição explícita: provider cloud DELEGA embed() a createLocalEmbedder (D-11)"
    - "Helper compartilhado decideWithFallback usado pelos dois providers (DRY + D-16)"
    - "Gate condicional de capability por família de modelo (reasoning.effort só gpt-5.x/o-series)"
key-files:
  created: []
  modified:
    - "src/config.ts: +seção Fase 6 (5 envs) +3 validações de boot"
    - "src/llm/provider.ts: +createLocalEmbedder +decideWithFallback +createOpenAiProvider +createProvider; createLmStudioProvider refatorado p/ delegar embed e reusar fallback"
decisions:
  - "D-05/D-13: default local custo-zero; cloud opt-in via LLM_PROVIDER=openai; createProvider() seleciona por env"
  - "D-11/D-03: embed() do provider cloud delega ao createLocalEmbedder — embeddings sempre locais"
  - "D-16: fallback z.toJSONSchema (nativo zod v4) no catch de withStructuredOutput, compartilhado pelos dois providers"
  - "D-04: reasoning.effort aplicado SOMENTE para /^(gpt-5|o\\d)/; omitido para gpt-4.1-mini (família não-reasoning)"
metrics:
  duration_min: 3
  completed: "2026-06-19"
  tasks: 2
  files: 2
---

# Phase 6 Plan 01: LLM Provider Factory Foundation Summary

Caminho cloud (GPT-4.1-mini) selecionável por env com embeddings sempre locais por composição explícita, factory de seleção `createProvider()`, e blindagem D-16 (z.toJSONSchema) que protege `decide()` contra o caveat zod v4 — tudo sem tocar `decideAction` nem o loop cognitivo.

## What Was Built

**Task 1 — envs do provider em `src/config.ts`** (commit `5cee167`)
- Nova seção `// === Fase 6: Provider LLM configurável (cloud/local) ===` com 5 chaves tipadas: `llmProvider` (default `local`), `openaiApiKey`, `openaiModel` (default `gpt-4.1-mini`), `openaiMaxTokens` (default 512), `openaiReasoningEffort` (default `low`).
- 3 validações de boot no mesmo estilo dos `if (...) throw new Error(...)` existentes: provider ∈ {local, openai}; openai exige API key; max_tokens ≥ 1.

**Task 2 — providers e fallback em `src/llm/provider.ts`** (commit `a39f313`)
- `createLocalEmbedder(baseURL?)`: extrai o fetch a `/v1/embeddings` num bloco reutilizável (D-11). `createLmStudioProvider` passou a DELEGAR `embed` a ele (sem duplicar o fetch).
- `decideWithFallback(model, schema, messages)`: encapsula o D-16 — 1ª tentativa via `withStructuredOutput(schema, method:'jsonSchema')`; no catch, deriva JSON Schema cru via `z.toJSONSchema` e reinvoca. Compartilhado pelos DOIS providers.
- `createOpenAiProvider()`: `ChatOpenAI` sem `configuration.baseURL` (endpoint padrão OpenAI), `model/apiKey` cloud, `maxTokens` cap; `available()` faz probe a `https://api.openai.com/v1/models`; `embed` delega a `createLocalEmbedder()` (embeddings nunca vão à cloud).
- `openaiModelKwargs()`: gate D-04 — só retorna `{ reasoning: { effort } }` se `/^(gpt-5|o\d)/.test(config.openaiModel)`; senão `{}` (gpt-4.1-mini é não-reasoning).
- `createProvider()`: `config.llmProvider === 'openai' ? createOpenAiProvider() : createLmStudioProvider()` (D-13).

## Verification Results

- `bun run typecheck` → exit 0 (sem erros de tipo introduzidos).
- `bun test src/llm/structured.test.ts` → 6 pass / 0 fail (suíte mock existente intacta; interface `LlmProvider` preservada).
- grep confirma: `createOpenAiProvider`, `createLocalEmbedder`, `createProvider`, `z.toJSONSchema`, gate `gpt-5|o\d` de reasoning, `createLocalEmbedder()` dentro de `createOpenAiProvider`.
- `grep -c "OpenAIEmbeddings" src/llm/provider.ts` → 0 (sem import/uso; comentário-pitfall reformulado).

## Requirements Satisfied

- **PROV-01:** caminho cloud GPT-4.1-mini selecionável por env (`createOpenAiProvider` + `createProvider` lendo `LLM_PROVIDER`).
- **PROV-02:** local continua default custo-zero (`createProvider` → `createLmStudioProvider` quando `llmProvider !== 'openai'`).
- **PROV-03:** `embed()` do provider cloud delega ao `createLocalEmbedder` local.
- **PROV-04 (parcial):** fallback D-16 (`z.toJSONSchema`) blinda `decide()` nos dois providers; teste de paridade fica no Plano 03.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Critério grep `OpenAIEmbeddings == 0` falhava por comentário literal**
- **Found during:** Task 2 (verificação de aceite)
- **Issue:** O comentário-pitfall herdado do código original continha o token literal `OpenAIEmbeddings`, fazendo `grep -c` retornar 1 mesmo sem nenhum import/uso real.
- **Fix:** Reformulado o comentário para "o cliente de embeddings do langchain trava com LM Studio — por isso NÃO o usamos aqui", preservando o aviso sem o token literal. grep agora retorna 0.
- **Files modified:** src/llm/provider.ts
- **Commit:** a39f313

## Notes for Downstream Plans

- `createProvider()` ainda NÃO está ligado em `src/cognition/loop.ts:31` — o plano restringe os arquivos a `config.ts` + `provider.ts`. A troca de `createLmStudioProvider()` por `createProvider()` no loop é integração de um plano posterior (D-13 prevê o ponto de injeção).
- O decorator `withSpendCap` (teto de custo, D-06/D-07) é o Plano 02; reusa `available()` para o fallback-to-local (D-08).
- O teste de paridade schema-only + gate `RUN_LIVE_PARITY` (D-14/D-15) é o Plano 03.

## Self-Check: PASSED
- src/config.ts — FOUND (modificado, validações presentes)
- src/llm/provider.ts — FOUND (4 exports novos presentes)
- Commit 5cee167 — FOUND
- Commit a39f313 — FOUND
