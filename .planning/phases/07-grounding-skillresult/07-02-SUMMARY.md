---
phase: 07-grounding-skillresult
plan: 02
subsystem: skills
tags: [skillresult, grounding, dig, navigate, stubs, d-08, d-12, mineflayer]

# Dependency graph
requires:
  - phase: 07-grounding-skillresult
    plan: 01
    provides: SkillResult/GroundState + captureGroundState + evaluateDig/evaluateNavigate (contrato consumido aqui)
  - phase: 01-skills
    provides: executeWithSafety/SkillTimeoutError/SkillStuckError + as 4 skills (navigate/dig/follow/attack) e o registry
provides:
  - dig(bot,params) GROUNDED — Promise<SkillResult> com captura before/after e delta lido no finally (D-08)
  - navigate(bot,params) GROUNDED — Promise<SkillResult> derivado da distância final ao alvo
  - follow/attack stubs uniformes — Promise<SkillResult>{outcome:'error'} sem lançar (D-12)
  - SkillFunction retipada para Promise<SkillResult>; SkillResult re-exportado por skills/index
affects: [07-03, 07-04, cognition/nodes, executor, gathering, navigate]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "try/catch sem rethrow + leitura do delta APÓS o catch (finally lógico) — observed sobrevive a throw mid-progresso (D-08)"
    - "Pré-condição não é throw de fluxo: bloco ausente/inalcançável/ar → return outcome:'no_effect' (D-12)"
    - "Stub uniforme: resolve com SkillResult{outcome:'error'} em vez de lançar — contrato igual ao das skills reais"

key-files:
  created:
    - src/skills/grounding.test.ts
  modified:
    - src/skills/dig.ts
    - src/skills/navigate.ts
    - src/skills/follow.ts
    - src/skills/attack.ts
    - src/skills/index.ts
    - src/skills/dig.test.ts
    - src/skills/dig.oom.smoke.test.ts

key-decisions:
  - "D-08 implementado como try/catch SEM rethrow + leitura de after/delta após o catch — o finally é lógico (não bloco finally), porque o valor de retorno depende do delta"
  - "Se lançou MAS observed>0 → reporta o parcial real (success/partial), não erro; só observed:0 com throw vira outcome:'error' (D-08)"
  - "Pré-condições do dig/navigate viram no_effect (não throw) — D-12; reason preserva a mensagem diagnóstica original"
  - "follow/attack ficam no shape base flat (observed/expected:0) enquanto stubs — observed não tipado por skill (D-02 da Plan 01 honrado)"

requirements-completed: [GRND-03]

# Metrics
duration: ~8min
completed: 2026-06-19
---

# Phase 7 Plan 2: Skills Grounded (SkillResult) Summary

**As 4 skills (navigate/dig/follow/attack) passam a SEMPRE retornar `SkillResult` — dig/navigate viram grounded de verdade (capturam GroundState before/after e julgam o outcome por delta real, não pela Promise), com o delta lido após o catch para reportar parciais de timeout mid-progresso (D-08); follow/attack param de lançar e resolvem com outcome:'error' (D-12).**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-06-19T23:27:35Z
- **Completed:** 2026-06-19T23:35:30Z
- **Tasks:** 4
- **Files modified:** 7 (1 criado, 6 modificados)

## Accomplishments
- `dig` agora retorna `Promise<SkillResult>`: captura `before`/`after` via `captureGroundState`, julga com `evaluateDig`, e lê o delta APÓS o `try/catch` — um timeout que coletou 3/10 reporta `observed:3` (D-08), não falha total.
- `navigate` agora retorna `Promise<SkillResult>`: outcome derivado da distância final ao alvo (`evaluateNavigate`), com o `reason` do timeout/stuck anexado para diagnóstico.
- `follow`/`attack` param de dar `throw` e resolvem com `SkillResult{outcome:'error'}` (D-12), mantendo a validação Zod `.parse`.
- `SkillFunction` retipada para `Promise<SkillResult>`; `SkillResult` re-exportado por `skills/index` para conveniência dos consumidores (Plan 03/04).
- Suite `grounding.test.ts` (8 testes) verde offline cobrindo o contrato de retorno e o não-lançamento dos stubs.

## Task Commits

Each task was committed atomically:

1. **Task 1: dig grounded com captura no finally (D-08)** - `7d5653b` (feat)
2. **Task 2: navigate grounded por distância ao alvo** - `0e4245d` (feat)
3. **Task 3: follow/attack stubs + retipa registry (D-12)** - `7380a9f` (feat)
4. **Task 4: suite de grounding das skills (offline)** - `ff15daa` (test)
5. **Deviation: atualiza dig.test/oom.smoke ao novo contrato** - `b3a046c` (test)

_TDD (Task 4): a implementação (Tasks 1-3) precedeu o teste por ordenação do plano — `grounding.test.ts` nasceu GREEN validando o contrato que as Tasks 1-3 estabeleceram. O RED real de cada conversão foi capturado pela quebra (esperada) dos testes legados, corrigida no commit de deviation._

## Files Created/Modified
- `src/skills/dig.ts` - dig grounded: Promise<SkillResult>, before/after, delta após catch (D-08), pré-condições → no_effect (D-12)
- `src/skills/navigate.ts` - navigate grounded: Promise<SkillResult> por distância ao alvo; bloco ausente → no_effect (D-12)
- `src/skills/follow.ts` - stub resolve com outcome:'error' (não lança); Zod .parse preservado
- `src/skills/attack.ts` - stub resolve com outcome:'error' (não lança); Zod .parse preservado
- `src/skills/index.ts` - SkillFunction = Promise<SkillResult>; re-export de SkillResult
- `src/skills/grounding.test.ts` - 8 testes de contrato (stubs não lançam, dig/navigate retornam shape SkillResult)
- `src/skills/dig.test.ts` - atualizado: pré-condições asseridas como no_effect (não rejeição) + mock ganha entity.position
- `src/skills/dig.oom.smoke.test.ts` - atualizado: inalcançável → no_effect, timeout → outcome:'error'; tripé OOM/lag<200ms intacto

## Decisions Made
- **D-08 como try/catch + leitura pós-catch:** não um bloco `finally` real, porque o valor de retorno DEPENDE do delta lido depois — `let threw` captura a exceção, `after`/`evaluate*` rodam sempre, e o outcome final combina os dois.
- **throw com progresso ≠ erro total (D-08):** se a ação lançou mas `observed > 0`, o resultado é o parcial real (`success`/`partial`) com `reason` anexado; só `observed:0` + throw vira `outcome:'error'`.
- **Pré-condições viram no_effect, não throw (D-12):** bloco não encontrado / inalcançável / ar na posição → `return {outcome:'no_effect', ...}` preservando a mensagem original em `reason`. Mata o throw-como-fluxo sem perder o diagnóstico.
- **Stubs no shape base flat:** follow/attack mantêm `observed/expected:0` (D-02 da Plan 01 — observed não tipado por skill enquanto stub).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Testes legados de dig asseriam o throw que o D-12 remove**
- **Found during:** Verificação final (full test suite após Tasks 1-4)
- **Issue:** `dig.test.ts` (casos 1 e 3) e `dig.oom.smoke.test.ts` (testes A e B) asseriam `rejects.toThrow()` para pré-condições/timeout — comportamento que a Task 1 converteu intencionalmente para `SkillResult` (no_effect / outcome:'error'). Além disso, os mocks não tinham `bot.entity.position`, agora exigido por `captureGroundState`.
- **Fix:** Mocks ganharam `entity.position`; asserções migradas para o contrato SkillResult (no_effect com reason para pré-condições; outcome:'error' reason:'SkillTimeoutError' para o timeout do collect). O tripé de aceitação D-07 (sem OOM, lag<200ms, collectCalls) foi preservado intacto.
- **Files modified:** src/skills/dig.test.ts, src/skills/dig.oom.smoke.test.ts
- **Commit:** b3a046c

## Issues Encountered
- Ordenação intra-plano: a conversão da assinatura de `dig`/`navigate` (Tasks 1-2) quebra o typecheck do registry até a Task 3 retipá-lo. Isso é inerente ao plano (a Task 3 É o ponto de compilação verde) — typecheck rodou verde no boundary natural após a Task 3, e cada task foi verificada localmente por grep das acceptance criteria.
- Avisos cosméticos `LF will be replaced by CRLF` no Git (Windows) — sem impacto.

## Handoff para a Plan 03 (IMPORTANTE)
- **O execute node ainda NÃO consome o SkillResult.** `src/cognition/nodes.ts` (~linha 233) trata QUALQUER resolução como `result:'success'` e só o `catch` como `'failure'`. Como as skills agora resolvem com `no_effect`/`error`/`partial` em vez de lançar, o execute node registrará `success` mesmo quando `observed:0` — reintroduzindo a alucinação "peguei 10 tábuas" se não for ajustado.
- **Isto é o escopo explícito da Plan 03** (objetivo desta plan: "a camada que produz o SkillResult que a Plan 03 (execute node/memória) e a Plan 04 (post-filter) consomem"). NÃO foi auto-corrigido aqui por estar fora do escopo desta plan e atribuído à próxima. A Plan 03 deve ler `r.outcome` do retorno e gravar na memória de curto prazo o outcome real (não a resolução da Promise).

## Self-Check: PASSED

- Arquivos: src/skills/grounding.test.ts criado; dig.ts/navigate.ts/follow.ts/attack.ts/index.ts modificados — todos FOUND
- Commits: 7d5653b, 0e4245d, 7380a9f, ff15daa, b3a046c — todos FOUND no histórico
- Verificações: `bun run typecheck` exit 0; `bun test src/skills src/grounding` 47 pass/0 fail; full suite 271 pass / 1 fail (o fail é o teste pré-existente de config `.env`, documentado no PROJECT.md — não regressão); `grep "throw new Error"` = 0 nas 4 skills; `captureGroundState` presente só em dig.ts + navigate.ts dentro de src/skills

---
*Phase: 07-grounding-skillresult*
*Completed: 2026-06-19*
