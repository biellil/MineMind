---
status: diagnosed
phase: 08-system-1-sobreviv-ncia-reflexa
source: [08-VERIFICATION.md, 08-04-PLAN.md]
started: 2026-06-22T00:00:00Z
updated: 2026-06-22T13:00:00Z
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
  root_cause: |
    Duas causas-raiz independentes.
    (a) HARD-GATE de ferramenta (D-13): dig.ts chama selectToolFor(bot,'oak_log'); tool-selector mapeia oak_log→'axe' e sem axe no inventário retorna null → dig encerra com no_effect "no compatible tool for oak_log" SEM tentar cavar. Em Minecraft oak_log é quebrável à mão (axe só acelera). Deadlock de bootstrap: precisa de madeira p/ craftar axe, mas o gate exige axe p/ coletar madeira.
    (b) A decisão deliberate action=explore é estruturalmente ignorada por dois canais determinísticos com precedência sobre llmDecision: (i) roteador DAG no execute roteia a skill por holder.currentGoal.id (gather:→dig) ANTES de qualquer lógica de state/llmDecision — o ramo 'exploring' fica inalcançável; (ii) ponte need→DAG no observe re-seleciona deterministicamente o 1º item insatisfeito da gatheringLadder (oak_log) e chama resolveDag, sem consultar llmDecision. Como a madeira nunca entra no inventário, oak_log fica eternamente insatisfeito. A reconstrução DAG no no_effect (D-03) limpa e reconstrói a MESMA rota sem escalonar → loop sem escape. maybeDeliberate grava holder.llmDecision mas nunca toca holder.currentGoal.
  artifacts:
    - path: "src/skills/dig.ts:49-56"
      issue: "Pré-flight D-13 recusa cavar oak_log sem axe (causa a)"
    - path: "src/skills/tool-selector.ts:46,84-98"
      issue: "oak_log→'axe'; selectToolFor retorna null sem axe (causa a)"
    - path: "src/cognition/nodes.ts:300-317"
      issue: "Roteador DAG roteia por currentGoal.id antes/independente de llmDecision (causa b-i)"
    - path: "src/cognition/nodes.ts:178-224"
      issue: "Ponte need→DAG determinística re-seleciona oak_log, ignora llmDecision (causa b-ii)"
    - path: "src/cognition/nodes.ts:532-551"
      issue: "Reconstrução DAG no no_effect refaz a MESMA rota sem escape/escalonamento"
    - path: "src/cognition/deliberation.ts:192-197"
      issue: "llmDecision gravado mas desconectado de currentGoal"
    - path: "src/config.ts:54"
      issue: "oak_log é o item 0 da gatheringLadder — fixa o alvo do loop"
  missing:
    - "Não tratar ausência de axe como bloqueio total — permitir coletar oak_log à mão (axe vira soft-preference) ou restringir o hard-gate a blocos que de fato exigem ferramenta (minérios/pedra)"
    - "Conectar explore/abandono ao canal DAG: suprimir/pular um goal DAG que falhou repetidamente (avançar p/ próximo item da ladder ou desistir da reconstrução após N falhas)"
    - "Marcar item em cooldown na ponte need→DAG para que oak_log não seja eternamente re-selecionado, dando espaço ao explore mudar o comportamento"
  debug_session: .planning/debug/dig-no-effect-loop.md
