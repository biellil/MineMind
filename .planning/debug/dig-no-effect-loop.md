---
status: diagnosed
trigger: "UAT Fase 08 SURV-02: bot preso em laço infinito gather:oak_log → dig NO_EFFECT (0/1) → limpa DAG → reconstrói. deliberate decide explore mas nunca muda o comportamento."
created: 2026-06-22T00:00:00Z
updated: 2026-06-22T00:00:00Z
---

## Current Focus

hypothesis: (a) dig oak_log dá no_effect porque o hard-gate de ferramenta (D-13) recusa cavar sem axe no inventário; (b) explore é ignorado porque o roteador DAG no execute roteia por holder.currentGoal.id (sub-goal DAG) ANTES de olhar llmDecision, e a ponte need→DAG no observe re-injeta gather:oak_log todo tick.
test: leitura completa de loop.ts, nodes.ts, dig.ts, tool-selector.ts, deliberation.ts, tech-tree.ts, config.ts
expecting: confirmar dois root causes independentes
next_action: retornar diagnóstico (find_root_cause_only)

## Symptoms

expected: Quando uma ação falha repetidamente, o bot progride no objetivo de coleta OU troca de estratégia.
actual: Laço infinito gather:oak_log → dig NO_EFFECT (0/1) → "[tech-tree] limpando sub-goals DAG" → reconstrói rota idêntica. deliberate decide action=explore ("não consigo minerar sem ferramenta") mas o estado segue gathering objetivo=gather:oak_log. "abandonando" dispara mas o goal é re-selecionado no tick seguinte.
errors: "NO_EFFECT dig {target:oak_log,count:1} (0/1)" repetindo
reproduction: rodar o bot autônomo sem axe no inventário, perto de oak_log; resources fica insatisfeito → ponte need→DAG escolhe oak_log.
started: Phase 10 (tech-tree DAG) — comportamento de gather/tech-tree, surgido na UAT da Fase 08.

## Eliminated

(nenhuma hipótese eliminada — ambas confirmadas por leitura de código)

## Evidence

- timestamp: 2026-06-22T00:00:00Z
  checked: src/skills/dig.ts:49-56 + src/skills/tool-selector.ts:45-99
  found: dig faz pré-flight de ferramenta D-13. blockToolCategory('oak_log')='axe' (tool-selector.ts:46). selectToolFor filtra inventory por /_axe$/; sem axe → retorna null → dig retorna no_effect "no compatible tool for oak_log" SEM tentar cavar. Em Minecraft real, oak_log é quebrável à mão.
  implication: ROOT CAUSE (a). Chicken-and-egg: precisa de madeira p/ fazer axe, mas o gate exige axe p/ pegar madeira.

- timestamp: 2026-06-22T00:00:00Z
  checked: src/cognition/nodes.ts:295-318 (roteador DAG no execute)
  found: O execute roteia a skill puramente por holder.currentGoal.id (prefixo DAG gather:/craft:/...) ANTES e INDEPENDENTE de state cognitivo e de llmDecision. goalToSkillParams('gather:oak_log') → {skill:'dig', target:'oak_log'}. O bloco de exploring (nodes.ts:331) só é alcançado se !skill — mas skill já foi setado pelo roteador DAG.
  implication: ROOT CAUSE (b) parte 1: a decisão LLM explore nunca chega a virar comportamento porque o roteador DAG tem precedência absoluta sobre llmDecision quando há currentGoal DAG.

- timestamp: 2026-06-22T00:00:00Z
  checked: src/cognition/nodes.ts:169-226 (ponte need→DAG no observe) + config.ts:53-58,179
  found: Quando resources urgente e currentGoal não-DAG, a ponte percorre gatheringLadder (oak_log é o 1º item, config.ts:54), pega o 1º item com have < resourceMinQuantity (default 1) e chama resolveDag. resolveDag('oak_log') cai no buildGatherResult → goal único gather:oak_log (tech-tree.ts:114-117,125-136). Seleciona como currentGoal (executableLeaf).
  implication: ROOT CAUSE (b) parte 2: a ponte é DETERMINÍSTICA e ignora llmDecision. Todo tick que limpa o DAG, o observe re-seleciona gather:oak_log porque a madeira nunca entra no inventário (no_effect) — o 1º item da ladder permanece insatisfeito para sempre.

- timestamp: 2026-06-22T00:00:00Z
  checked: src/cognition/nodes.ts:532-551 (reconstrução DAG D-03 no no_effect)
  found: no_effect em sub-goal DAG limpa holder.goals DAG e zera currentGoal → no próximo tick alreadyHasDag=false → a ponte reconstrói a MESMA rota gather:oak_log. Sem escalonamento/troca de alvo: o mesmo item insatisfeito da ladder é re-escolhido.
  implication: explica o loop infinito sem escape. A limpeza-e-reconstrução é puramente determinística; não há fallback para o próximo item da ladder nem honra do explore.

- timestamp: 2026-06-22T00:00:00Z
  checked: src/cognition/deliberation.ts:192-197 + src/cognition/loop.ts:401-429
  found: maybeDeliberate grava holder.llmDecision={decision,at} mas NUNCA toca holder.currentGoal. O execute usa llmTarget/fresh.decision SÓ nos ramos gathering(preferência de bloco) e building — nunca para sobrepor um currentGoal DAG. action=explore mapeia para state 'exploring' no analyze (actionToCognitiveState), mas o ramo exploring no execute é inalcançável porque o roteador DAG já setou skill=dig.
  implication: confirma a desconexão deliberate→comportamento. A decisão LLM e o currentGoal DAG são dois canais paralelos; o roteador DAG vence sempre.

- timestamp: 2026-06-22T00:00:00Z
  checked: src/cognition/nodes.ts:405-425 (anti-repeat / abandonando)
  found: recordAttempt/shouldAbandon dispara "abandonando" e recordFailure(target) com cooldown por-tipo (targetCooldownMs 15s). Mas o currentGoal continua sendo gather:oak_log e a ponte need→DAG re-seleciona oak_log independentemente do cooldown do alvo da safety (a ponte percorre a ladder por inventário, não consulta cooledDownTargets). O cooldown só afeta o ramo gathering NÃO-DAG (nodes.ts:322-324), não o roteador DAG.
  implication: o mecanismo anti-repeat existe mas é contornado pelo caminho DAG — o abandono não impede a re-seleção do mesmo goal.

## Resolution

root_cause: |
  Duas causas-raiz independentes:

  (a) dig oak_log retorna no_effect por um HARD-GATE de ferramenta (D-13, Fase 10).
  dig.ts:49-56 chama selectToolFor(bot, 'oak_log'); tool-selector.ts mapeia oak_log→'axe'
  e, sem axe no inventário, retorna null → dig encerra com no_effect "no compatible tool
  for oak_log" SEM tentar cavar. Em Minecraft, oak_log é quebrável à mão (axe só acelera).
  O gate cria um deadlock de bootstrap: precisa de madeira para craftar axe, mas exige axe
  para coletar madeira.

  (b) A decisão deliberate action=explore é estruturalmente ignorada por DOIS canais
  determinísticos que têm precedência sobre llmDecision:
    - Roteador DAG no execute (nodes.ts:300-317) roteia a skill por holder.currentGoal.id
      (prefixo gather:) ANTES de qualquer lógica baseada em state/llmDecision. Como o
      currentGoal é gather:oak_log, sempre vira dig — o ramo 'exploring' (nodes.ts:331) é
      inalcançável.
    - Ponte need→DAG no observe (nodes.ts:178-224) é determinística: re-seleciona o 1º item
      insatisfeito da gatheringLadder (oak_log, config.ts:54) e chama resolveDag, sem consultar
      llmDecision. Como a madeira nunca entra no inventário (no_effect), oak_log fica
      permanentemente insatisfeito.
  A reconstrução DAG no no_effect (D-03, nodes.ts:532-551) limpa e reconstrói a MESMA rota
  sem escalonar nem trocar de alvo → loop infinito sem escape. maybeDeliberate grava
  holder.llmDecision mas nunca toca holder.currentGoal, então a decisão LLM nunca redireciona
  o canal DAG.
fix: ""
verification: ""
files_changed: []
