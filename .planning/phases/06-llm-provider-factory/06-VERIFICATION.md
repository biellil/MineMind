---
phase: 06-llm-provider-factory
verified: 2026-06-19T22:16:09Z
status: passed
score: 13/13 must-haves verified
human_verification:
  - test: "Paridade live entre os dois providers reais"
    expected: "ActionDecisionSchema.parse() não lança para a saída de LM Studio E de GPT-4.1-mini"
    why_human: "Requer LM Studio rodando + OPENAI_API_KEY válida + rede; o teste existe gated por RUN_LIVE_PARITY mas o CI nunca o aciona (D-15). Rodar antes de release."
---

# Phase 6: LLM Provider Factory Verification Report

**Phase Goal:** O agente pode trocar entre GPT-4.1-mini (cloud) e LM Studio (local) por env/config sem tocar o loop cognitivo, com proteção de custo e paridade de saída estruturada verificada nos dois caminhos.
**Verified:** 2026-06-19T22:16:09Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
| -- | ----- | ------ | -------- |
| 1  | `LLM_PROVIDER=openai` seleciona GPT-4.1-mini; `=local` (default) usa LM Studio, sem tocar o loop | ✓ VERIFIED | `createProvider()` provider.ts L220 ramifica por `config.llmProvider`; loop.ts L33 usa `createProvider({ db: holder.db })` (única troca, sem lógica de provider no loop) |
| 2  | Com provider cloud, `embed()` continua local (`/v1/embeddings`), nunca cloud | ✓ VERIFIED | `createOpenAiProvider` L177 `createLocalEmbedder()`; `withSpendCap.embed = cloud.embed` (local por composição) spendCap.ts L70; `createLocalEmbedder` faz fetch a `${baseURL}/embeddings` apontando p/ LM Studio |
| 3  | `decide()` sobrevive ao caveat zod v4 via fallback `z.toJSONSchema` nos DOIS providers | ✓ VERIFIED | `decideWithFallback` provider.ts L72-89 (try withStructuredOutput → catch z.toJSONSchema); ambos providers chamam-no; teste structured.test.ts L91 prova recuperação (calls===2) |
| 4  | `reasoning.effort` só enviado p/ família gpt-5.x/o-series, nunca gpt-4.1-mini | ✓ VERIFIED | `openaiModelKwargs()` provider.ts L152-157 gate `/^(gpt-5|o\d)/` → `{}` p/ gpt-4.1-mini |
| 5  | Ao atingir o teto na janela, decide/chat NÃO vai à cloud — cai para o local | ✓ VERIFIED | `withSpendCap.route()` spendCap.ts L46 `getCallCount >= maxCalls ? local : cloud`; spendCap.test.ts L67 prova `cloud.decide` undefined no teto |
| 6  | Contador sobrevive a restart (SQLite, janela diária) | ✓ VERIFIED | spendStore.ts: `CREATE TABLE llm_spend`, upsert `ON CONFLICT(window_key)`, janela `YYYY-MM-DD`; spendStore.test cobre persistência/isolamento de janela |
| 7  | Com `LLM_PROVIDER=local` o spend-cap é no-op (sem decorator) | ✓ VERIFIED | provider.ts L222 `if (config.llmProvider !== 'openai') return createLmStudioProvider()` — retorna local direto |
| 8  | tokens contados só como métrica de log, gate é por chamadas | ✓ VERIFIED | spendStore.ts coluna `tokens` separada de `calls`; `route()` compara `getCallCount` (calls); incrementCall passa tokens=0 hoje |
| 9  | Teste schema-only afirma type:'object' (pega caveat zod v4 no CI sem rede) | ✓ VERIFIED | parity.test.ts L24-33 `z.toJSONSchema(ActionDecisionSchema).type === 'object'`; roda no CI, passa |
| 10 | Teste mock prova o fallback D-16/D-17 (type:None → recupera) | ✓ VERIFIED | structured.test.ts L91-107 mock lança `type:'None'` na 1ª, recupera na 2ª (calls===2) |
| 11 | Teste live gated por RUN_LIVE_PARITY percorre os dois providers; CI nunca aciona | ✓ VERIFIED | parity.test.ts L38 `test.skipIf(!LIVE)`; run mostra 1 skip |
| 12 | validate→repair→fallback (D-17) preservado nos testes existentes | ✓ VERIFIED | structured.test.ts 7 testes (6 originais + 1 novo) todos verdes |
| 13 | Sem tocar `decideAction`/loop cognitivo (cap como decorator) | ✓ VERIFIED | spendCap é decorator de LlmProvider; loop.ts mudou só a linha de criação do provider; structured.ts intacto |

**Score:** 13/13 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `src/llm/provider.ts` | createOpenAiProvider/createLocalEmbedder/createProvider + fallback D-16 | ✓ VERIFIED | 236 linhas; 4 exports novos; decideWithFallback; gate reasoning; sem OpenAIEmbeddings |
| `src/config.ts` | envs provider/cloud + validação de boot | ✓ VERIFIED | 8 chaves Fase 6 (L110-124) + 5 validações (L229-242) |
| `src/llm/spendStore.ts` | contador SQLite por janela | ✓ VERIFIED | ensureSpendTable/windowKey/incrementCall/getCallCount; upsert atômico |
| `src/llm/spendCap.ts` | withSpendCap decorator + SpendStore + sqliteSpendStore | ✓ VERIFIED | route() hard-cap; fallback-to-local; embed sempre via cloud |
| `src/cognition/loop.ts` | usa createProvider() (D-13) | ✓ VERIFIED | L33 `createProvider({ db: holder.db })`; createLmStudioProvider removido |
| `src/llm/parity.test.ts` | schema-only (D-14) + live gated (D-15) | ✓ VERIFIED | 2 testes; CI roda schema-only, skipa live |
| `src/llm/structured.test.ts` | teste fallback D-16/D-17 | ✓ VERIFIED | 7 testes (era 6); novo teste type:None L91 |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| createOpenAiProvider | createLocalEmbedder().embed | delegação D-11 | ✓ WIRED | provider.ts L177 + L206 `embed: embedder.embed` |
| createProvider | config.llmProvider/LLM_PROVIDER | seleção local vs openai D-05/D-13 | ✓ WIRED | provider.ts L222 |
| withSpendCap.decide | local.decide (fallback ao estourar) | hard-cap D-07/D-08 | ✓ WIRED | spendCap.ts L46/L50 route()+p.decide |
| spendStore.ts | bun:sqlite Database | tabela llm_spend D-09 | ✓ WIRED | CREATE TABLE + prepare/run |
| loop.ts | createProvider | substitui createLmStudioProvider D-13 | ✓ WIRED | loop.ts L13 import + L33 chamada |
| parity.test (schema-only) | ActionDecisionSchema via z.toJSONSchema | assert type==='object' D-14 | ✓ WIRED | parity.test.ts L28-29 |
| parity.test (live) | createProvider() local e openai | skipIf RUN_LIVE_PARITY D-15 | ✓ WIRED | parity.test.ts L36-48 |

### Data-Flow Trace (Level 4)

N/A para esta fase — os artefatos são abstração de provider/factory/decorator e suítes de teste, não componentes que renderizam dados dinâmicos. O fluxo de dados real (saída do LLM) é exercitado pelo teste live gated (human verification) e pelos mocks de structured.test/spendCap.test.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Suítes da Fase 6 passam | `bun test src/llm/{spendStore,spendCap,structured,parity}.test.ts` | 18 pass / 1 skip / 0 fail | ✓ PASS |
| Loop não quebrou com fiação createProvider | `bun test src/cognition/loop.smoke.test.ts` | 3 pass / 0 fail | ✓ PASS |
| Tipos íntegros (assinatura Database\|null) | `bun run typecheck` | exit 0 | ✓ PASS |
| Paridade live nos dois providers reais | `RUN_LIVE_PARITY=1 ...` | skipped no CI | ? SKIP → human |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| PROV-01 | 06-01 | Usar GPT-4.1-mini cloud selecionável por env | ✓ SATISFIED | createOpenAiProvider + createProvider lendo LLM_PROVIDER |
| PROV-02 | 06-01 | LM Studio local default custo-zero, trocável sem alterar loop | ✓ SATISFIED | createProvider default → createLmStudioProvider; loop.ts só troca a linha de criação |
| PROV-03 | 06-01 | Embeddings sempre locais independente do chat | ✓ SATISFIED | embed delega a createLocalEmbedder nos dois providers + withSpendCap |
| PROV-04 | 06-01, 06-03 | Structured output válido em ambos (paridade) | ✓ SATISFIED | fallback D-16 (provider.ts) + teste schema-only/mock/live (parity+structured tests) |
| PROV-05 | 06-02 | Teto de gasto/frequência configurável | ✓ SATISFIED | withSpendCap hard-cap persistido em SQLite + fallback-to-local |

Todos os 5 IDs declarados nas frontmatters dos planos estão em REQUIREMENTS.md mapeados a Phase 6; nenhum órfão. REQUIREMENTS.md já marca os 5 como Complete.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | Nenhum TODO/FIXME/placeholder/stub em src/llm | — | Nenhum |

O `console.warn('[provider] sem db — spend-cap desativado')` (provider.ts L233) é comportamento intencional documentado (D-09: sem persistência o cap seria volátil e mascararia crash-loop), não um stub.

### Human Verification Required

#### 1. Paridade live entre os dois providers reais

**Test:** Com LM Studio rodando, executar `LLM_PROVIDER=local RUN_LIVE_PARITY=1 bun test src/llm/parity.test.ts`; depois, com chave válida, `LLM_PROVIDER=openai OPENAI_API_KEY=... RUN_LIVE_PARITY=1 bun test src/llm/parity.test.ts`.
**Expected:** Em ambos, `ActionDecisionSchema.parse()` não lança — saída estruturada parseável dos dois caminhos reais.
**Why human:** Requer LM Studio ativo, chave OpenAI válida e rede; o teste existe e está gated por design (D-15) para o CI nunca incorrer custo/dependência externa. É a verificação end-to-end final do critério #2 do goal.

### Gaps Summary

Nenhum gap. Os 13 must-haves verificam; os 5 requisitos (PROV-01..05) estão satisfeitos com evidência de código; 18/19 testes da fase passam (o único skip é o live gated por design); typecheck limpo; loop smoke verde confirma que a fiação `createProvider` não quebrou o loop cognitivo. A única ação pendente é a verificação live opcional pré-release (human), que não bloqueia o goal automatizado.

Nota: a falha pré-existente `src/config.test.ts > carrega com valores default sem .env` (perceptionRadius 32 vs 20 do `.env` v1.0) NÃO foi atribuída à Phase 6 — fora do escopo e arquivos desta fase.

---

_Verified: 2026-06-19T22:16:09Z_
_Verifier: Claude (gsd-verifier)_
