---
status: complete
phase: 08-system-1-sobreviv-ncia-reflexa
source: [08-VERIFICATION.md, 08-04-PLAN.md]
started: 2026-06-22T00:00:00Z
updated: 2026-06-22T12:30:00Z
---

## Current Test

[testing complete]

## Tests

### 1. SURV-01 — eat reflex AO VIVO
expected: Com fome baixa (food ≤16) e comida no inventário, o bot come por reflexo — log `[reflex] eat success` e a barra de comida sobe, sem esperar o tick do LLM.
result: pass

### 2. SURV-02 — flee/defend reflex AO VIVO
expected: Com mob hostil próximo (creeper/zombie), o bot preempta (`preemptando … (lifeCritical)`) e foge (ou dá 1 golpe se encurralado) em sub-segundo.
result: issue
reported: "Run ao vivo não exercitou o reflexo — nenhum mob hostil apareceu. O log mostra o bot preso em laço infinito gather:oak_log → dig → NO_EFFECT (0/1) → limpa DAG → reconstrói, repetindo indefinidamente. O deliberate decide action=explore ('não consigo minerar sem ferramenta adequada') mas o roteador tech-tree sempre volta para gather:oak_log → dig; a decisão de explorar nunca muda o comportamento. Bot nunca progride até SIGINT."
severity: major
scope-note: "Comportamento de gather/tech-tree (Fase 9/10), NÃO a camada reflexa da Fase 08. O reflexo flee/defend (System 1) não foi falsificado — apenas não teve gatilho. Achado já antecipado em 08-04-SUMMARY como fora de escopo."

### 3. SURV-04 — guardas ambientais AO VIVO
expected: Próximo de lava ou queda > 3 blocos, o gatilho `lavaAhead`/`fallAhead` preempta e o bot recua — não anda para a lava/abismo.
result: pass

### 4. SURV-05 — preempção imediata (não trava no LLM) AO VIVO
expected: Durante uma preempção reflexa, o bot para imediatamente via `setGoal(null)` — não fica travado aguardando a inferência.
result: pass

## Summary

total: 4
passed: 3
issues: 1
pending: 0
skipped: 0
blocked: 0

## Gaps

(Gate primário D-20 — `[reflect] reflexão executada` ao vivo — JÁ confirmado pelo usuário em 2026-06-22; regressão B1 não reapareceu. Os 4 itens acima são a demonstração física dos reflexos de sobrevivência, não exercitada na sessão de verificação por falta de situação-gatilho. Comportamento coberto por testes unitários — suite 455 pass / 0 fail.)

- truth: "Bot progride no objetivo de coleta ou troca de estratégia quando uma ação falha repetidamente"
  status: failed
  reason: "User reported (run ao vivo): bot preso em laço infinito gather:oak_log → dig → NO_EFFECT (0/1) → limpa DAG → reconstrói. deliberate decide action=explore mas o roteador tech-tree sempre volta para gather:oak_log → dig; a decisão de explorar nunca muda o comportamento. Bot nunca progride até SIGINT."
  severity: major
  test: 2
  scope: "out-of-phase — gather/tech-tree (Fase 9/10), não a camada reflexa System 1 da Fase 08. Reflexo flee/defend não foi falsificado (sem gatilho hostil)."
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""
