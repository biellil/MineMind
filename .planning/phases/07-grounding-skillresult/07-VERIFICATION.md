---
phase: 07-grounding-skillresult
verified: 2026-06-19T21:10:00Z
status: passed
score: 4/4 success criteria verified (13/13 must-have truths)
re_verification: false
---

# Phase 7: Grounding + SkillResult — Relatório de Verificação

**Phase Goal:** Toda skill retorna um resultado verificado por delta real de inventário/mundo, e o agente só relata (chat/memória) o que o estado confirma — eliminando a alucinação "peguei 10 tábuas" que corromperia a tech-tree e o aprendizado.
**Verified:** 2026-06-19T21:10:00Z
**Status:** passed
**Re-verification:** No — verificação inicial

## Goal Achievement

### Critérios de Sucesso (ROADMAP) — Observable Truths

| # | Critério | Status | Evidência |
|---|----------|--------|-----------|
| 1 | Cada skill retorna `SkillResult` cujo outcome deriva de `observed` (delta antes-depois), nunca da Promise | ✓ VERIFIED | `SkillResult` em `grounding/types.ts:34`; `evaluateDig`/`evaluateNavigate` derivam outcome de delta numérico (`evaluate.ts:12-43`); spot-check: `evaluateDig 3/10 → {outcome:'partial',observed:3}` |
| 2 | navigate/dig/follow/attack convertidas para `SkillResult` grounded (generaliza progressChecker do dig) | ✓ VERIFIED | dig (`dig.ts:37,118`) e navigate (`navigate.ts:41,90`) capturam before/after + evaluate; follow/attack retornam `{outcome:'error'}` sem throw; `SkillFunction = Promise<SkillResult>` (`index.ts:21`) |
| 3 | O que o bot diz/grava bate com o inventário real ("peguei 10 tábuas" não ocorre mais) | ✓ VERIFIED (automated) / ? human (centenas de ações ao vivo) | 3 camadas: prompt autoritativo (`prompts.ts:156`), memória derivada do delta (`nodes.ts:238-262`), post-filter (`postFilter.ts:36`). Spot-check: `reconcileQuantities('Peguei 10 tábuas!', observed:3) → 'Peguei 3 tábuas!'` |
| 4 | Ação com `observed`<`expected` registrada como falha, não sucesso | ✓ VERIFIED | `nodes.ts:239-258`: `success = result.outcome === 'success'`; partial/no_effect/error → `result:'failure'`; bug `result:'success'`-por-não-throw eliminado (grep count = 0) |

**Score:** 4/4 critérios verificados (critério #3 com componente ao-vivo deferido a human).

### Must-Have Truths por Plan

| Plan | Truth | Status |
|------|-------|--------|
| 01 | `SkillResult` tagueado por outcome com observed/expected/delta | ✓ |
| 01 | `captureGroundState` retorna snapshot imutável (Object.freeze+structuredClone) | ✓ (`capture.ts:28`) |
| 01 | `evaluate` puro decide outcome por comparação numérica sem mock de bot | ✓ (`evaluate.ts`) |
| 02 | navigate/dig outcome vem de captura before/after + evaluate (não da Promise) | ✓ |
| 02 | follow/attack param de throw e retornam `{outcome:'error'}` | ✓ |
| 02 | Delta capturado no finally — timeout 3/10 reporta observed:3 (D-08) | ✓ (`dig.ts:109-118`) |
| 03 | Execute node grava outcome derivado do SkillResult, mata bug nodes.ts | ✓ |
| 03 | MemEvent.action carrega outcome/observed/expected; partial tratado (D-13) | ✓ (`types.ts:22-31`, `longTerm.ts:38-39`) |
| 03 | observed<expected gravado como falha-não-sucesso preservando número | ✓ |
| 03 | serializeContext injeta observedDelta autoritativo (D-09 A) | ✓ (`prompts.ts:156`, call-site `deliberation.ts:130`) |
| 04 | Fala reconciliada contra observedDelta antes de bot.chat | ✓ |
| 04 | Post-filter é gate determinístico escopado a quantidade/coleta | ✓ |
| 04 | Sem divergência → fala inalterada; fact=null → no-op | ✓ |

### Required Artifacts

| Artifact | Provides | Status | Details |
|----------|----------|--------|---------|
| `src/grounding/types.ts` | SkillResult + GroundState + SkillOutcome | ✓ VERIFIED | reusa Position3D da perception |
| `src/grounding/capture.ts` | captureGroundState imutável + inventoryDelta | ✓ VERIFIED | Object.freeze(structuredClone(...)) |
| `src/grounding/evaluate.ts` | evaluateDig/evaluateNavigate puros | ✓ VERIFIED | importado por dig/navigate |
| `src/skills/dig.ts` | dig → Promise\<SkillResult\> grounded | ✓ VERIFIED | before/after + evaluateDig; 0 throws de fluxo |
| `src/skills/navigate.ts` | navigate → Promise\<SkillResult\> grounded | ✓ VERIFIED | before/after + evaluateNavigate; 0 throws |
| `src/skills/follow.ts` / `attack.ts` | stubs → {outcome:'error'} | ✓ VERIFIED | sem throw de fluxo |
| `src/skills/index.ts` | SkillFunction = Promise\<SkillResult\> | ✓ VERIFIED | registry compila |
| `src/cognition/types.ts` | MemEvent.action estendido | ✓ VERIFIED | outcome/observed/expected + result derivado |
| `src/cognition/nodes.ts` | execute consome SkillResult | ✓ VERIFIED | bug morto (grep count=0) |
| `src/cognition/state.ts` | holder.lastObservedDelta | ✓ VERIFIED | campo + init null |
| `src/llm/prompts.ts` | serializeContext injeta FATO VERIFICADO | ✓ VERIFIED | param opcional + uso |
| `src/chat/postFilter.ts` | reconcileQuantities puro | ✓ VERIFIED | escopo mínimo pt-BR |
| `src/chat/conversation.ts` | reconcile antes de bot.chat | ✓ VERIFIED | aplicado no único ponto de saída |

### Key Link Verification

| From | To | Via | Status |
|------|----|----|--------|
| capture.ts | perception/snapshot.ts | padrão Object.freeze(structuredClone) | ✓ WIRED |
| dig.ts | grounding/capture.ts | captureGroundState before/after | ✓ WIRED |
| navigate.ts | grounding/evaluate.ts | evaluateNavigate | ✓ WIRED |
| nodes.ts | skills/index.ts | `result.outcome` derivado do SkillResult | ✓ WIRED |
| nodes.ts | state.ts | holder.lastObservedDelta (sucesso E catch) | ✓ WIRED |
| prompts.ts | deliberation.ts | serializeContext(..., holder.lastObservedDelta) 5º arg | ✓ WIRED (`deliberation.ts:130`) |
| conversation.ts | postFilter.ts | reconcileQuantities(reply, fact) antes de bot.chat | ✓ WIRED |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| evaluateDig deriva outcome do delta | `evaluateDig(0→3 itens, expected:10)` | `{outcome:'partial',observed:3,expected:10,delta:{oak_log:3}}` | ✓ PASS |
| post-filter reescreve alucinação | `reconcileQuantities('Peguei 10 tábuas!', observed:3)` | `'Peguei 3 tábuas!'` | ✓ PASS |
| typecheck | `bun run typecheck` | exit 0, sem erros | ✓ PASS |
| suite de testes | `bun test` | 279 pass, 1 skip, 1 fail (pré-existente) | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Descrição | Status | Evidência |
|-------------|-------------|-----------|--------|-----------|
| GRND-01 | 07-01 | SkillResult baseado em delta real, não na Promise | ✓ SATISFIED | types.ts + evaluate.ts puros |
| GRND-02 | 07-03, 07-04 | Relata só o confirmado (chat/memória) | ✓ SATISFIED (live = human) | prompt + memória + post-filter (3 camadas) |
| GRND-03 | 07-02 | 4 skills convertidas para SkillResult | ✓ SATISFIED | dig/navigate grounded; follow/attack stubs |
| GRND-04 | 07-03 | observed≠expected → falha, não sucesso | ✓ SATISFIED | nodes.ts:239-258 |

Nenhum requisito ORPHANED — REQUIREMENTS.md mapeia exatamente GRND-01..04 a Phase 7, todos reivindicados pelos planos.

### Anti-Patterns Found

| File | Padrão | Severidade | Impacto |
|------|--------|-----------|---------|
| skills/{dig,navigate,follow,attack}.ts | `throw new Error` como fluxo | — | 0 ocorrências (D-12 honrado) |
| cognition/nodes.ts | `result:'success'` por não-throw | — | 0 ocorrências (bug histórico eliminado) |
| grounding/* | import de skills/ | — | 0 (módulo base, sem dependência circular) |

Nenhum stub renderizando dado vazio detectado. follow/attack são stubs intencionais (Fase 2+) com contrato `{outcome:'error'}` explícito.

### Human Verification Required

#### 1. Grounding ao vivo em centenas de ações (Critério #3)

**Test:** Rodar o bot conectado a um servidor Minecraft, mandar coletar/minerar repetidamente e comparar o que ele fala no chat e grava na memória contra o inventário real do jogo.
**Expected:** Em centenas de ações, nenhuma fala "peguei N" com N divergente do inventário real; memória sempre reflete o delta observado.
**Why human:** Requer LM Studio + servidor Minecraft ao vivo e observação longitudinal — o drift do LLM local só se manifesta em volume. As 3 camadas de defesa estão verificadas estruturalmente e por spot-check determinístico, mas a métrica "centenas de ações" é comportamental ao vivo.

### Gaps Summary

Nenhum gap bloqueante. Todos os 13 must-have truths verificados no código, todos os 7 key links conectados, os 4 requisitos satisfeitos, typecheck limpo e suite verde (279 pass). A única falha de teste (`config > carrega com valores default sem .env`) é pré-existente e documentada (lê `.env` local), não relacionada à Fase 7. O componente ao-vivo do Critério #3 ("centenas de ações") está roteado para verificação humana — as defesas estruturais (memória derivada do delta, prompt autoritativo, post-filter determinístico) estão todas implementadas e wired.

---

_Verified: 2026-06-19T21:10:00Z_
_Verifier: Claude (gsd-verifier)_
