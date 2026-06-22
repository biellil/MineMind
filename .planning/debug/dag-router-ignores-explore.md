---
status: verifying
trigger: "A decisão action=explore do LLM (e os goalUpdates do reflect) são estruturalmente ignorados pelos canais determinísticos do loop cognitivo. Coleta inviável → bot preso re-roteando o mesmo gather:X."
created: 2026-06-22T19:29:16Z
updated: 2026-06-22T20:05:00Z
---

## Current Focus

hypothesis: ROOT CAUSE (b) confirmada — design de fix APROVADO pelo usuário no checkpoint.
test: implementar OS DOIS fixes + cobrir com testes; validar com bun test + bunx tsc --noEmit
expecting: ponte need→DAG pula techTarget em cooldown e escala na ladder; com TODOS os itens
  em cooldown, action=explore do LLM redireciona o canal para exploring (não fica preso em dig)
next_action: editar a ponte (observe) e o roteador (execute) em nodes.ts; adicionar testes

## Symptoms

expected: Quando o LLM decide action=explore (ou o reflect emite goalUpdates drop/reprioritize)
  porque a coleta atual não progride / é inviável, o comportamento do bot DEVE mudar — explorar
  para achar recurso, OU escalonar para o próximo item da ladder, OU dropar/reprioritizar o goal travado.
actual: O roteador DAG no execute roteia a skill puramente por holder.currentGoal.id (prefixo
  gather:/craft:/...) ANTES e INDEPENDENTE de llmDecision. A ponte need→DAG no observe re-seleciona
  deterministicamente o 1º item insatisfeito da gatheringLadder e chama resolveDag, sem consultar
  llmDecision. maybeDeliberate grava holder.llmDecision mas nunca toca holder.currentGoal. Resultado:
  explore/goalUpdates nunca redirecionam o canal DAG; só ficam mascarados quando a coleta progride.
errors: (não há erro/exception; problema de comportamento/arquitetura — decisão LLM sem efeito)
reproduction: Rodar o bot autônomo SEM o recurso da ladder alcançável (ex: longe de qualquer
  oak_log). resources insatisfeito → ponte need→DAG fixa gather:oak_log → dig dá no_effect (alvo
  fora de alcance) → limpa DAG → reconstrói a MESMA rota. O LLM decide explore repetidamente, sem efeito.
started: Fase 10 (tech-tree DAG). Documentado como "root cause (b)" da sessão resolvida
  dig-no-effect-loop (o fix (c)/parseDigTarget mascarou o sintoma no caso comum, mas (b) permanece
  quando a coleta é genuinamente inviável).

## Eliminated

(nenhuma — investigação confirma a hipótese estrutural por leitura de código atualizado)

## Evidence

- timestamp: 2026-06-22T19:29:16Z
  checked: src/cognition/nodes.ts:330-348 (roteador DAG no execute, pós-fix parseDigTarget)
  found: |
    O execute roteia a skill por holder.currentGoal.id ANTES de QUALQUER lógica de state/llmDecision.
    `if (snap && currentGoal && DAG_PREFIXES.some(p => currentGoal.id.startsWith(p)))` → goalToSkillParams
    → skill=dig, target=paramsJson. Só DEPOIS, com `if (!skill && ...)`, os ramos gathering/exploring/
    building/socializing são avaliados. Como currentGoal=gather:oak_log seta skill=dig, o ramo
    'exploring' (nodes.ts:362) é INALCANÇÁVEL. As linhas mudaram (+~36) após a inserção de parseDigTarget,
    mas a estrutura de precedência é idêntica à da sessão anterior.
  implication: ROOT CAUSE (b) parte 1 — confirmada. O roteador DAG vence llmDecision sempre que há
    currentGoal DAG. explore nunca vira navigate.

- timestamp: 2026-06-22T19:29:16Z
  checked: src/cognition/nodes.ts:200-256 (ponte need→DAG no observe) + config.ts:53-58,186
  found: |
    A ponte é determinística: percorre config.gatheringLadder (oak_log é o 1º, config.ts:54), pega o
    1º item com have < config.resourceMinQuantity (=1, config.ts:186) e chama resolveDag(techTarget,...).
    NÃO consulta holder.llmDecision em ponto algum. O guard alreadyHasDag só evita reconstruir quando
    JÁ há sub-goals DAG no holder — mas o D-03 limpa esses goals no no_effect, então no tick seguinte
    alreadyHasDag=false e a MESMA rota é reconstruída. Não há consulta a cooledDownTargets aqui (o
    cooldown da safety só afeta o ramo gathering NÃO-DAG via highestPriorityGatherTarget).
  implication: ROOT CAUSE (b) parte 2 — confirmada. A ponte re-seleciona oak_log enquanto a madeira
    não entrar no inventário; com alvo inalcançável isso é permanente. O cooldown de alvo é contornado.

- timestamp: 2026-06-22T19:29:16Z
  checked: src/cognition/nodes.ts:574-592 (reconstrução DAG D-03 no no_effect)
  found: |
    no_effect em sub-goal DAG: holder.goals = goals.filter(não-DAG) e holder.currentGoal=null. Não há
    escalonamento (avançar para o próximo item da ladder), nem registro de "este techTarget falhou".
    O próximo observe re-seleciona o MESMO 1º item insatisfeito.
  implication: explica o loop sem escape. A limpeza+reconstrução é puramente determinística e idempotente
    no alvo — re-seleciona oak_log indefinidamente.

- timestamp: 2026-06-22T19:29:16Z
  checked: src/cognition/deliberation.ts:159-243 (maybeDeliberate ação) + 256-328 (runReflection)
  found: |
    maybeDeliberate (caminho de AÇÃO) grava holder.llmDecision={decision,at} (linha 230) e NUNCA toca
    holder.currentGoal nem holder.goals. runReflection (caminho de REFLEXÃO) aplica goalUpdates via
    applyGoalUpdates (linha 324) → holder.goals. PORÉM: applyGoalUpdates só edita goals JÁ presentes
    por id (drop remove, reprioritize muta priority). Como o DAG é reconstruído do ZERO no observe
    (resolveDag gera goals novos com committedAt=now), um drop de 'gather:oak_log' é desfeito no próximo
    tick que a ponte reconstrói a rota. reprioritize idem: a nova folha resolveDag nasce com
    basePriority=urgency, sobrescrevendo qualquer reprioritize.
  implication: confirma os DOIS desfechos do canal LLM. (1) action=explore: gravada em llmDecision mas
    sem poder sobre o roteador DAG. (2) goalUpdates do reflect: aplicados ao holder.goals mas efêmeros —
    a ponte need→DAG reconstrói e re-injeta a mesma rota. Ambos os canais LLM são paralelos ao DAG e
    perdem para ele.

- timestamp: 2026-06-22T19:29:16Z
  checked: src/cognition/safety.ts (cooldownUntil/cooledDownTargets) + src/motivation/tech-tree.ts:45-118
  found: |
    safety JÁ tem cooldownUntil:Map<target,until> alimentado por recordFailure (chamado no no_effect do
    execute, nodes.ts:516). cooledDownTargets(safety,now) devolve o set de alvos em cooldown
    (targetCooldownMs=15s). Esse set HOJE só é consumido pelo arbiter e pelo ramo gathering não-DAG —
    a ponte need→DAG NÃO o consulta. tech-tree.resolveDag é PURO (bot + memo); buildGatherResult cria
    gather:<item>. Logo, dá para PULAR um techTarget em cooldown na ponte sem tocar tech-tree.ts —
    a infra de cooldown já existe e é reutilizável (opção 2).
  implication: a opção 2 (escalonar na ladder) é de baixo risco: basta a ponte need→DAG saltar itens
    cujo gather:<item> (ou o próprio item) esteja em cooledDownTargets. Reusa a safety existente, não
    altera o módulo puro tech-tree, e respeita o caso comum (item viável nunca entra em cooldown).

## Resolution

root_cause: |
  ROOT CAUSE (b) — CONFIRMADA por código atualizado (pós-fix parseDigTarget da sessão dig-no-effect-loop).
  A decisão LLM (action=explore) e os goalUpdates da reflexão são estruturalmente IGNORADOS por TRÊS
  canais determinísticos que têm precedência sobre o canal LLM quando há um currentGoal DAG:

  1. Roteador DAG no execute (nodes.ts:331-348): roteia a skill por holder.currentGoal.id ANTES de
     qualquer lógica baseada em cogState/llmDecision. currentGoal=gather:oak_log → skill=dig sempre;
     o ramo 'exploring' (nodes.ts:362, guardado por `!skill`) é inalcançável.
  2. Ponte need→DAG no observe (nodes.ts:209-256): determinística, re-seleciona o 1º item insatisfeito
     da gatheringLadder (oak_log) e chama resolveDag, SEM consultar llmDecision nem cooledDownTargets.
  3. Reconstrução D-03 no no_effect (nodes.ts:574-592): limpa holder.goals DAG + zera currentGoal sem
     escalonar → a ponte reconstrói a MESMA rota no tick seguinte. Loop sem escape quando o alvo é
     genuinamente inalcançável.

  O canal LLM: maybeDeliberate grava holder.llmDecision mas nunca toca currentGoal/goals (deliberation.ts:230);
  runReflection aplica goalUpdates ao holder.goals (deliberation.ts:324 → applyGoalUpdates) mas o efeito é
  efêmero porque a ponte reconstrói o DAG do zero (resolveDag gera goals novos), desfazendo drop/reprioritize.
fix: |
  IMPLEMENTADO (aprovado no checkpoint). Dois fixes cirúrgicos em src/cognition/nodes.ts, reusando
  a infra de cooldown de safety; tech-tree.ts (módulo puro) NÃO foi tocado.

  (1) OPÇÃO 2 — escalonar na ladder (fix primário). Extraída a seleção de techTarget da ponte
     need→DAG (observe) para uma função PURA exportada `pickTechTarget(ladder, invCounts, minQty,
     cooledDown)`. Ela pula itens cujo nome cru OU cujo paramsJson DAG ('{"target":X,"count":1}')
     esteja em cooledDownTargets(safety, now), ESCALONANDO para o próximo item insatisfeito. A ponte
     agora chama pickTechTarget(config.gatheringLadder, invCounts, config.resourceMinQuantity,
     cooledDownTargets(safety, t)). Resultado: com oak_log inalcançável (em cooldown via recordFailure),
     a ponte escala para birch_log/cobblestone/... em vez de re-fixar oak_log.

  (2) OPÇÃO 1 reduzida — explore como escape final. No roteador DAG do execute, adicionados os guards
     dagTargetCooledDown (o paramsJson do currentGoal DAG está em cooldown) e llmWantsEscape (decisão
     LLM fresca com action=explore|navigate). Quando AMBOS verdadeiros (dagRouterYieldsToExplore), o
     roteador NÃO rota dig — deixa skill=null para o ramo 'exploring' (navigate) assumir. analyze já
     mapeia explore/navigate → cogState 'exploring', então o ramo exploring dispara. É o escape quando
     o escalonamento da ladder se esgota (todos os itens em cooldown e a folha DAG travada reaparece).
verification: |
  - bunx tsc --noEmit: LIMPO (0 erros).
  - bun test src/cognition: 162 pass / 0 fail (baseline era 153; +9 testes efetivos). Verde em 3 runs
    consecutivas (sem flakiness na suíte de cognição).
  - Testes adicionados em src/cognition/nodes.test.ts:
    * pickTechTarget (6 testes): default→1º item; pula alvo em cooldown na forma nome cru E paramsJson;
      escala múltiplos cooldowns; pula item já satisfeito; TODOS em cooldown → null.
    * roteador DAG cede ao explore (3 testes): gather:oak_log em cooldown + explore → navigate (NÃO dig);
      sem cooldown → dig (comportamento padrão preservado); cooldown + action=gather (não-escape) → dig.
  - Correção colateral: afterEach de nodes.test.ts agora salva/restaura skillRegistry.navigate (os novos
    testes o mockam) — evita vazamento de mock para reconnect.test.ts.
  - NOTA: 2 falhas no `bun test` GLOBAL (config.test.ts "valores default sem .env" e reconnect CONN-03)
    são PRÉ-EXISTENTES e NÃO relacionadas: ambas passam em isolamento; a de config é o .env de dev
    sobrescrevendo MC_HOST/MC_PORT; a de CONN-03 é poluição de process.env entre arquivos de OUTRAS
    suítes. Nenhuma toca os arquivos alterados.
files_changed:
  - src/cognition/nodes.ts (pickTechTarget exportado + ponte need→DAG usa-o; guard de escape no roteador DAG)
  - src/cognition/nodes.test.ts (9 testes novos + restauração de navigate no afterEach)
