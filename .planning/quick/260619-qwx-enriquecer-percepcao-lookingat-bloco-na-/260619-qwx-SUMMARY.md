---
phase: quick/260619-qwx
plan: 01
subsystem: perception
tags: [perception, world-snapshot, llm-prompt, mineflayer]
requires:
  - WorldSnapshot (contrato PERC-04 existente)
  - serializeContext (render de contexto p/ LLM)
provides:
  - WorldSnapshot.lookingAt (LookingAtBlock | null)
  - WorldSnapshot.underfoot (string)
  - LookingAtBlock (novo tipo exportado)
  - render de "Na mira", "Sob os pés" e "Entidades próximas" no prompt
affects:
  - Fases 2/3/4 que consomem WorldSnapshot (mudança ADITIVA, sem breaking change de campos)
tech-stack:
  added: []
  patterns:
    - "captura defensiva a null em buildWorldSnapshot (blockAtCursor / blockAt podem retornar null)"
    - "render compacto com limite (~5 entidades) para preservar orçamento de prompt"
key-files:
  created:
    - src/perception/snapshot.test.ts
    - src/llm/prompts.test.ts
  modified:
    - src/perception/types.ts
    - src/perception/snapshot.ts
    - src/llm/prompts.ts
    - src/perception/types.test.ts
    - src/cognition/loop.smoke.test.ts
    - src/cognition/loop.phase3.smoke.test.ts
    - src/cognition/reconnect.test.ts
    - src/cognition/reflection.integration.smoke.test.ts
    - src/cognition/deliberation.test.ts
    - src/llm/schemas.test.ts
decisions:
  - "lookingAt usa alcance fixo de 5 blocos em blockAtCursor(5) (escopo do plano)"
  - "underfoot faz fallback para 'unknown' quando blockAt(offset -1) retorna null (defensivo)"
  - "render de entities limitado a 5 e formato compacto '{nome} (Nm)', espelhando o tratamento de players"
metrics:
  duration: ~8 min
  completed: 2026-06-19
  tasks: 3
  files: 10
---

# Quick Task 260619-qwx: Enriquecer Percepção (lookingAt, underfoot, entities) Summary

Enriquece o `WorldSnapshot` com o bloco na mira do bot (`lookingAt`) e o bloco sob os pés (`underfoot`), capturados defensivamente em `buildWorldSnapshot`, e passa a renderizar esses dois campos mais as entidades já capturadas (até ~5 mobs/jogadores próximos) no contexto compacto enviado ao LLM em `serializeContext`.

## O que foi feito

### Task 1 — Contrato WorldSnapshot (commit `5cfb21e`)
- Novo tipo exportado `LookingAtBlock` (`name` / `position` / `distance`) em `src/perception/types.ts`.
- Dois campos novos em `WorldSnapshot`: `lookingAt: LookingAtBlock | null` e `underfoot: string`. Campos pré-existentes inalterados (mudança aditiva — sem breaking change de nomes/tipos).
- `types.test.ts` estendido: lookingAt preenchido, lookingAt null e underfoot; literal de imutabilidade atualizado.

### Task 2 — Captura em buildWorldSnapshot (commit `6f91bba`)
- `lookingAt` via `bot.blockAtCursor(5)` (alcance 5); `null` quando não há bloco na mira.
- `underfoot` via `bot.blockAt(pos.offset(0,-1,0))` com fallback `'unknown'` quando `blockAt` retorna null.
- Ambos incluídos no objeto `raw` antes do `structuredClone + Object.freeze` (snapshot continua congelado e sem referência ao bot).
- Novo `snapshot.test.ts` cobrindo os 4 ramos (cursor Block/null, below Block/null) + freeze.

### Task 3 — Render em serializeContext (commit `8ce9450`)
- `"Na mira: {nome} (Nm)"` apenas quando há bloco na mira.
- `"Sob os pés: {underfoot}"` sempre.
- `"Entidades próximas: ..."` com até 5 entidades (nome + distância arredondada), só quando há entities; mantém o orçamento de prompt (compacto, espelhando players).
- JSDoc de `serializeContext` atualizado. Tolerância a `snapshot null` preservada.
- Novo `prompts.test.ts` cobrindo todos os ramos.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Mocks de bot pré-existentes não tinham `blockAtCursor` nem `pos.offset`**
- **Found during:** verificação da suite completa (Task 2/3).
- **Issue:** `buildWorldSnapshot` passou a chamar `bot.blockAtCursor(5)` e `pos.offset(0,-1,0)`. Os mocks mínimos de bot em `loop.smoke.test.ts`, `loop.phase3.smoke.test.ts` e `reconnect.test.ts` não implementavam esses métodos → `TypeError: bot.blockAtCursor is not a function` no `reconnect.test.ts` (e risco nos demais).
- **Fix:** adicionado `blockAtCursor: () => null` e `offset` ao `pos` fake nos três mocks (mundo vazio → lookingAt null, underfoot unknown). Comportamento dos testes inalterado.
- **Commits:** `6f91bba` (loop smoke x2), `4f90974` (reconnect).

**2. [Rule 3 - Blocking] Literais de WorldSnapshot em testes precisavam dos campos aditivos**
- **Found during:** typecheck e suite.
- **Issue:** literais tipados como `WorldSnapshot` em `schemas.test.ts`, `deliberation.test.ts`, `reflection.integration.smoke.test.ts` e `loop.phase3.smoke.test.ts` ficaram incompletos com os novos campos obrigatórios.
- **Fix:** adicionado `lookingAt: null` e `underfoot: 'unknown'` a cada literal. (`arbiter.test.ts` usa `as unknown as WorldSnapshot` → não exigiu mudança.)
- **Commits:** `6f91bba`.

**3. [Rule 1 - Bug] Casts de freeze quebraram no tsc estrito**
- **Found during:** `bun run typecheck` (após Task 3).
- **Issue:** `(snapshot as Record<string, unknown>)` deixou de compilar (TS2352) porque `WorldSnapshot` não tem index signature; o cast antigo só passava porque o objeto era inferido como literal anônimo.
- **Fix:** cast via `unknown` primeiro (`as unknown as Record<string, unknown>`) em `types.test.ts` e `snapshot.test.ts`.
- **Commit:** `4f90974`.

## Verification

- `bun test src/perception/types.test.ts src/perception/snapshot.test.ts src/llm/prompts.test.ts` — passam.
- `bun test` (suite completa): **240 pass / 0 fail** (694 expect()).
- `bun run typecheck` (`tsc --noEmit`): **sem erros**.

## Known Stubs

Nenhum. Os valores `null` / `'unknown'` são fallbacks defensivos legítimos do contrato (sem bloco na mira / bloco indisponível), não stubs de dado não-fiado.

## Self-Check: PASSED
