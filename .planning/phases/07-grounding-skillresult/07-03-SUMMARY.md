---
phase: 07-grounding-skillresult
plan: 03
subsystem: cognition
tags: [grounding, skillresult, memevent, d-09, d-13, grnd-02, grnd-04, execute-node, prompt]

# Dependency graph
requires:
  - phase: 07-grounding-skillresult
    plan: 01
    provides: SkillResult/SkillOutcome (contrato de outcome consumido aqui)
  - phase: 07-grounding-skillresult
    plan: 02
    provides: skillRegistry retorna Promise<SkillResult> (dig/navigate grounded; follow/attack stubs sem throw)
provides:
  - MemEvent.action estendido com outcome/observed/expected (result vira derivado de outcome) — D-13
  - execute node consome result.outcome e grava memória do delta REAL observado (bug "success por não-throw" morto) — D-09 B
  - holder.lastObservedDelta (último delta observado) p/ prompt autoritativo e post-filter da Plan 04
  - serializeContext injeta bloco "FATO VERIFICADO" autoritativo no caminho de AÇÃO — D-09 A
affects: [07-04, cognition/nodes, cognition/state, llm/prompts, memory/longTerm, cognition/personality]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "MemEvent.action: outcome é a fonte de verdade (SkillOutcome); result:'success'|'failure' permanece DERIVADO p/ compat dos consumidores (D-13) — só success→success, todo o resto→failure (GRND-04)"
    - "Memória derivada do SkillResult observado, nunca da resolução da Promise — o catch agora trata SÓ exceções genuínas (D-12), pois skills não lançam como fluxo"
    - "holder.lastObservedDelta como fato autoritativo injetado no prompt: o LLM narra SÓ a partir do delta verificado (D-09 A/C)"

key-files:
  created: []
  modified:
    - src/cognition/types.ts
    - src/memory/longTerm.ts
    - src/cognition/personality.ts
    - src/cognition/nodes.ts
    - src/cognition/state.ts
    - src/llm/prompts.ts
    - src/cognition/deliberation.ts
    - src/cognition/reconnect.test.ts
    - src/cognition/reflection.test.ts
    - src/cognition/personality.test.ts
    - src/memory/longTerm.test.ts
    - src/cognition/reflection.integration.smoke.test.ts
    - src/cognition/loop.phase3.smoke.test.ts

key-decisions:
  - "result mantido como campo DERIVADO de outcome (não removido) — evita reescrever todo consumidor; outcome/observed são a verdade nova (D-13)"
  - "execute node: outcome === 'success' alimenta recordSuccess; partial/no_effect/error alimentam recordFailure (GRND-04 — não-sucesso conta p/ o backoff D-11)"
  - "FATO VERIFICADO injetado APENAS no caminho de AÇÃO (deliberation.ts:125); o caminho de REFLEXÃO não recebe o delta (param opcional, retrocompatível)"
  - "[Rule 1] loop.phase3.smoke: navigate grounded reporta no_effect num mock que não move o bot → backoff D-11 leva o estado final a oscilar exploring/idle; asserção rígida 'exploring' substituída por toContain(['exploring','idle'])"

requirements-completed: [GRND-02, GRND-04]

# Metrics
duration: ~7min
completed: 2026-06-19
---

# Phase 7 Plan 3: Execute Node Grounded + MemEvent Estendido Summary

**O execute node deixa de gravar `result:'success'` por uma Promise que não lançou e passa a derivar a memória do `SkillResult` OBSERVADO (`result.outcome`/`observed`) — matando a alucinação histórica "peguei 10 tábuas" na raiz; o `MemEvent.action` ganha `outcome`/`observed`/`expected` (D-13, com `result` virando campo derivado), o `holder.lastObservedDelta` guarda o último delta para o prompt e o post-filter da Plan 04, e o `serializeContext` injeta um bloco "FATO VERIFICADO" autoritativo que ordena o LLM a narrar só a partir do que de fato aconteceu (D-09 A).**

## Performance

- **Duration:** ~7 min
- **Tasks:** 4
- **Files modified:** 13 (0 criados, 13 modificados)

## Accomplishments
- **Bug de raiz morto (GRND-02 camada B / D-09 B):** `src/cognition/nodes.ts` agora lê `const result = await skillRegistry[skill](...)` e deriva `success = result.outcome === 'success'`. Um navigate/dig que resolve com `no_effect`/`observed:0` é gravado como `result:'failure'`, não mais como `success`. `grep "result: 'success', timestamp"` retorna 0.
- **MemEvent.action estendido (D-13):** `outcome: SkillOutcome` + `observed` + `expected` na variante action; `result` permanece DERIVADO (`success` só quando `outcome==='success'`) para não quebrar consumidores. O tsc estrito forçou a migração de `longTerm`, `personality` e dos 5 testes.
- **Consumidores tratam `partial` explicitamente:** `importanceOf` (error/no_effect → 6, partial → 4) e `summarizeEvent` (narra `(observed/expected)`, ex.: "Ação dig em oak_log: partial (3/10)."); `personality` baixa confidence em partial/no_effect/error (GRND-04).
- **holder.lastObservedDelta (D-09 A/C):** novo campo no `CognitiveStateHolder`, setado em sucesso/erro/anti-repeat, init `null`. Disponível para o post-filter da Plan 04.
- **Prompt autoritativo (D-09 A):** `serializeContext` ganha 5º param opcional `lastObservedDelta` → bloco "FATO VERIFICADO (autoritativo — narre SÓ a partir disto)". Call-site de AÇÃO em `deliberation.ts` passa `holder.lastObservedDelta`; assinatura retrocompatível.
- Suite inteira verde (271 pass / 1 skip), exceto o fail pré-existente do teste de config `.env` (documentado, não-regressão).

## Task Commits

Cada task foi commitada atomicamente:

1. **Task 1: estende MemEvent.action (D-13) + migra longTerm/personality** - `5ff2e1d` (feat)
2. **Task 2: execute node deriva memória do SkillResult + holder.lastObservedDelta (D-09 B)** - `a49dd13` (feat)
3. **Task 3: serializeContext injeta observedDelta autoritativo (D-09 A)** - `2527e0e` (feat)
4. **Task 4: migra os 5 testes de MemEvent action + ajusta loop.phase3.smoke** - `de3f412` (test)

_TDD (Tasks 1 e 4): a mudança de tipo (D-13) É o RED — o `tsc` estrito quebrou todos os consumidores/testes que ainda usavam o shape antigo. Cada task verificou o boundary de compilação verde no ponto natural (Task 3 fecha o source; Task 4 fecha os testes), espelhando o padrão da Wave 2._

## Files Created/Modified
- `src/cognition/types.ts` - variante action ganha outcome/observed/expected; import de SkillOutcome
- `src/memory/longTerm.ts` - importanceOf e summarizeEvent por outcome (partial explícito, narra observed/expected)
- `src/cognition/personality.ts` - humor lê outcome (success sobe; partial/no_effect/error baixam confidence)
- `src/cognition/nodes.ts` - execute node consome result.outcome (bug morto); holder.lastObservedDelta em sucesso/erro/anti-repeat; catch só p/ exceções genuínas (D-12)
- `src/cognition/state.ts` - campo lastObservedDelta no holder + init null
- `src/llm/prompts.ts` - serializeContext 5º param opcional + bloco "FATO VERIFICADO" (D-09 A)
- `src/cognition/deliberation.ts` - caminho de AÇÃO passa holder.lastObservedDelta a serializeContext
- `src/cognition/{reconnect,reflection,personality}.test.ts`, `src/memory/longTerm.test.ts`, `src/cognition/reflection.integration.smoke.test.ts` - literais de action migrados; asserts de importanceOf/summarizeEvent atualizados
- `src/cognition/loop.phase3.smoke.test.ts` - [Rule 1] asserção de estado final ajustada ao grounding (ver Deviations)

## Decisions Made
- **`result` derivado, não removido (D-13):** manter `result:'success'|'failure'` na action evita reescrever cada leitor; `outcome`/`observed` são a verdade nova. Reduz o blast radius da migração ao essencial.
- **outcome → recordSuccess/recordFailure (GRND-04):** só `outcome==='success'` zera o backoff; partial/no_effect/error contam como falha p/ o D-11 — uma ação observada como sem-efeito DEVE alimentar o backoff, senão o bot repete a ação inócua.
- **FATO VERIFICADO só no caminho de AÇÃO:** o delta autoritativo serve para o LLM não inventar quantidades ao decidir/narrar a próxima ação; o caminho de reflexão (deliberation.ts:169) já resume a memória inteira e não recebe o param (opcional → retrocompatível).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Asserção rígida do loop.phase3.smoke assumia "navigate sempre sucesso"**
- **Found during:** Verificação final (full suite após Tasks 1-4)
- **Issue:** `loop.phase3.smoke.test.ts` (Teste A) asseria `expect(last.cogState).toBe('exploring')` após 10 ticks num mock vazio. Com o grounding desta plan, o `navigate` num mock cujo `pathfinder.goto` é no-op (posição fixa na origem) é corretamente reportado como `no_effect` (observed:0), não mais `success` por não-throw. Repetidos `no_effect` alimentam o backoff D-11 (`consecutiveFailures` → `shouldFallbackToIdle`), então o estado final passa a oscilar entre `exploring` (agindo) e `idle` (backoff) — ambos saídas válidas do arbiter autônomo. A asserção antiga codificava exatamente a suposição buggy que esta plan elimina.
- **Fix:** Asserção trocada para `expect(['exploring', 'idle']).toContain(last.cogState)` com comentário explicando o efeito do grounding/backoff. O propósito real do teste (D-17: degrada ao arbiter, não trava, memória acumula — linhas 73-86) permanece intacto e verde.
- **Files modified:** src/cognition/loop.phase3.smoke.test.ts
- **Commit:** de3f412

## Issues Encountered
- **Boundary de compilação intra-plano (esperado):** a mudança de tipo da Task 1 quebra o tsc dos consumidores até as Tasks 2-4 migrarem. Inerente à propagação D-13 — idêntico ao padrão registrado na Wave 2 (07-02). Cada task verificada por grep das acceptance criteria no boundary natural; tsc verde só após a Task 4.
- **Fail pré-existente de config:** `config > carrega com valores default sem .env` continua falhando (lê o `.env` local) — documentado no PROJECT.md e no 07-02-SUMMARY como não-regressão.
- Avisos cosméticos `LF will be replaced by CRLF` no Git (Windows) — sem impacto.

## Handoff para a Plan 04
- `holder.lastObservedDelta` está disponível e setado a cada ação (sucesso/erro/anti-repeat) — é o insumo do post-filter da Plan 04 (rejeitar/regravar narrativas do LLM que contradigam o delta observado).
- O bloco "FATO VERIFICADO" já entra no prompt de AÇÃO; a Plan 04 pode reforçar isso no caminho de CHAT/narração se necessário.

## Self-Check: PASSED

- Arquivos modificados (types.ts, nodes.ts, state.ts, prompts.ts, deliberation.ts, longTerm.ts, personality.ts + 6 testes) — todos FOUND
- Commits: 5ff2e1d, a49dd13, 2527e0e, de3f412 — todos FOUND no histórico
- Verificações: `bun run typecheck` exit 0; `bun test` 271 pass / 1 skip / 1 fail (o fail é o teste de config `.env`, não-regressão); `grep "result: 'success', timestamp" src/cognition/nodes.ts` = 0 (bug morto); `grep "result.outcome" src/cognition/nodes.ts` confirma consumo do SkillResult; `grep "FATO VERIFICADO" src/llm/prompts.ts` = 1

---
*Phase: 07-grounding-skillresult*
*Completed: 2026-06-19*
