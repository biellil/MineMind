---
phase: quick-260622-nif
plan: 01
subsystem: chat / cognition-loop
tags: [chat, concurrency, autonomous, assistant, reverts-D-07, reverts-D-12]
requires:
  - src/cognition/concurrency.ts (Semaphore.acquire(priority) + createTaskGate)
provides:
  - "shouldRespond responde em AUTONOMOUS e ASSISTANT (exceto auto-mensagem)"
  - "routePlayerTurn(semaphore, gate, run) sem preempção — turno de player NÃO aborta a ação em voo"
affects:
  - src/cognition/loop.ts (wiring bot.on('chat'))
tech-stack:
  added: []
  patterns:
    - "Coordenação de chat por gate-por-tipo + prioridade no semáforo (sem abort destrutivo)"
key-files:
  created: []
  modified:
    - src/chat/conversation.ts
    - src/chat/conversation.test.ts
    - src/cognition/loop.ts
    - src/cognition/concurrency-wiring.test.ts
decisions:
  - "Reverte D-07: AUTONOMOUS agora responde ao jogador (chat uniforme entre modos)"
  - "Reverte D-12: turno de player não preempta/aborta a ação em voo — roda em paralelo, coordenado só pelo gate por tipo + prioridade 0 no semáforo"
  - "actionAbort preservado (consumidor próprio do dispatch de ação: timeout/sessão), apenas deixou de ser acionado pelo turno de player"
metrics:
  duration: "~6 min"
  completed: 2026-06-22
---

# Quick 260622-nif: No modo AUTONOMOUS a IA responde ao jogador (e nenhum modo aborta a ação em voo) Summary

`shouldRespond` agora retorna `true` em AUTONOMOUS e ASSISTANT (mantido só o guard de auto-mensagem), e `routePlayerTurn` perdeu o parâmetro/efeito de preempção — o turno conversacional roda em paralelo à ação, coordenado apenas pelo gate por tipo `'player'` + prioridade 0 no semáforo, sem abortar trabalho em voo.

## What Changed

- **`src/chat/conversation.ts`** — `shouldRespond` substitui o ramo `AUTONOMOUS => false` (D-07) por `return true` após o guard `username === botUsername`. Doc-comment reescrito documentando a reversão de D-07; assinatura preservada (`_proactivity` segue não-usado).
- **`src/cognition/loop.ts`** — `routePlayerTurn` agora é `(semaphore, gate, run)`: removidos o parâmetro `preemptAction` e a chamada `preemptAction()`. Função `shouldPreemptAction` removida (ficou órfã). Wiring do `bot.on('chat')` chama `routePlayerTurn` com 3 args (sem `() => actionAbort?.abort()`). `actionAbort` mantido intacto (ainda usado pelo dispatch de ação em 440-451 para timeout/sessão), apenas deixou de ser abortado pelo turno de player. Comentários (declaração de `actionAbort`, doc de `routePlayerTurn`, comentário inline do wiring) atualizados para documentar a reversão de D-12.
- **`src/chat/conversation.test.ts`** — teste antigo `AUTONOMOUS reactive => false (D-07)` reescrito para `=> true`; adicionado caso `AUTONOMOUS proactive => true`. Guards de auto-mensagem e testes de objetivo dinâmico (ASSISTANT gera goal / AUTONOMOUS nunca gera) preservados.
- **`src/cognition/concurrency-wiring.test.ts`** — 4 testes de `routePlayerTurn` reescritos para a assinatura de 3 args (removido o mock `preempt` e as asserções de preempção); teste `shouldPreemptAction` removido; adicionado teste `NÃO aborta a ação em voo (reverte D-12)` que verifica `routePlayerTurn.length === 3`.

## Tasks Completed

| Task | Name | Commits |
| ---- | ---- | ------- |
| 1 | shouldRespond responde em AUTONOMOUS e ASSISTANT (reverte D-07) | a757659 (test RED), 2484dc4 (impl) |
| 2 | routePlayerTurn para de abortar + wiring sem preempção (reverte D-12) | f343e53 (test RED), b0b6ddf (impl) |
| 3 | Suíte completa verde + typecheck | (verificação — sem mudança de código) |

## Verification

- `bun test src/chat/conversation.test.ts` — 12 pass / 0 fail.
- `bun test src/cognition/concurrency-wiring.test.ts` — 5 pass / 0 fail.
- `bun test` (suíte completa) — 506 pass, 1 skip, 0 fail (507 testes em 61 arquivos).
- `bunx tsc --noEmit` — limpo (exit 0). Nenhuma referência órfã a `shouldPreemptAction`/`preemptAction` (só uma menção em comentário de teste).

## Deviations from Plan

None - plan executado exatamente como escrito. Conforme instrução da Task 2, `grep` confirmou que `actionAbort` tem outro consumidor (dispatch de ação, linhas 440-451), então foi mantido intacto — só parou de ser acionado pelo turno de player.

## Self-Check: PASSED
