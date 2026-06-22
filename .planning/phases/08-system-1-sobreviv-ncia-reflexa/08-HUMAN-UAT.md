---
status: partial
phase: 08-system-1-sobreviv-ncia-reflexa
source: [08-VERIFICATION.md, 08-04-PLAN.md]
started: 2026-06-22T00:00:00Z
updated: 2026-06-22T00:00:00Z
---

## Current Test

[awaiting human testing — live in-game demonstration of survival reflexes]

## Tests

### 1. SURV-01 — eat reflex AO VIVO
expected: Com fome baixa (food ≤16) e comida no inventário, o bot come por reflexo — log `[reflex] eat success` e a barra de comida sobe, sem esperar o tick do LLM.
result: [pending]

### 2. SURV-02 — flee/defend reflex AO VIVO
expected: Com mob hostil próximo (creeper/zombie), o bot preempta (`preemptando … (lifeCritical)`) e foge (ou dá 1 golpe se encurralado) em sub-segundo.
result: [pending]

### 3. SURV-04 — guardas ambientais AO VIVO
expected: Próximo de lava ou queda > 3 blocos, o gatilho `lavaAhead`/`fallAhead` preempta e o bot recua — não anda para a lava/abismo.
result: [pending]

### 4. SURV-05 — preempção imediata (não trava no LLM) AO VIVO
expected: Durante uma preempção reflexa, o bot para imediatamente via `setGoal(null)` — não fica travado aguardando a inferência.
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps

(Gate primário D-20 — `[reflect] reflexão executada` ao vivo — JÁ confirmado pelo usuário em 2026-06-22; regressão B1 não reapareceu. Os 4 itens acima são a demonstração física dos reflexos de sobrevivência, não exercitada na sessão de verificação por falta de situação-gatilho. Comportamento coberto por testes unitários — suite 455 pass / 0 fail.)
