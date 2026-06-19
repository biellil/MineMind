---
phase: 03-cogni-o-com-llm-loop-completo-necessidades-e-objetivos
plan: 05
subsystem: cognition
tags: [verification, headless-test, human-checkpoint, fallback, reconnect, conn-03, d-17]
requires:
  - src/cognition/state.ts (createCognitiveStateHolder — holder reusado entre sessões)
  - src/cognition/graph.ts (buildGraph com holder+provider)
  - src/cognition/deliberation.ts (maybeDeliberate single-flight)
  - src/cognition/loop.smoke.test.ts (makeMockBot espelhado)
provides:
  - "src/cognition/loop.phase3.smoke.test.ts (smoke headless: D-17 fallback ao arbiter, needs/goals no grafo, tick não-bloqueante)"
  - "src/cognition/reconnect.test.ts (prova CONN-03: holder reusado preserva memory/goals/disposition/needs)"
  - "Checkpoint humano ao vivo executado — critérios de sucesso da Fase 3 confirmados (com 1 blocker pré-existente registrado)"
affects:
  - "Fecha a Fase 3 do ponto de vista de verificação dos requisitos próprios (COG-03/CONN-03/CHAT/LLM/NEED/GOAL)"
tech-stack:
  added: []
  patterns:
    - "Smoke headless espelhando o padrão do Plan 02-04 (makeMockBot + bun:test, sem servidor MC nem LM Studio)"
    - "CONN-03 provado a nível de unidade: UM holder, duas sessões simuladas, estado preservado (em-processo — D-20)"
    - "LlmProvider MOCK com available:false força o caminho fallback do arbiter (D-17)"
key-files:
  created:
    - src/cognition/loop.phase3.smoke.test.ts
    - src/cognition/reconnect.test.ts
  modified: []
decisions:
  - "Checkpoint ao vivo (Task 3) executado com o usuário em servidor MC real + LM Studio (qwen/qwen3-vl-8b @ localhost:1235). Critérios cognitivos/LLM/conversa/controle/degradação CONFIRMADOS ao vivo."
  - "Gathering-OOM (backlog 999.1) re-confirmado de forma CRÍTICA ao vivo (~12 GB de RAM, derruba o bot). É blocker da skill dig/collectBlock da Fase 2 — NÃO é requisito da Fase 3. Mascarou a observação ao vivo de D-13 (pedido→objetivo de coleta) e D-15 (preempção com resources). Ambos permanecem provados headless (Plans 02/03/04)."
  - "Para concluir o checkpoint ao vivo o gathering foi desligado temporariamente (escada de coleta vazia + resources weight 0); mudanças REVERTIDAS após o teste."
metrics:
  tasks: 3
  files_created: 2
  files_modified: 0
  commits: 3
  tests: "5 novos (smoke 3 A/B/C + reconnect 2); 160/160 na suite completa — todos verdes; tsc --noEmit limpo"
  duration_min: ~30
  completed: 2026-06-19
---

# Phase 3 Plan 05: Verificação da Fase 3 (Headless + Checkpoint Humano) Summary

Fecha a Fase 3 provando que os critérios estruturais críticos estão atendidos, em duas frentes: (1) testes headless automatizados (sem servidor MC nem LM Studio) que provam degradação ao arbiter sem LLM (D-17), CONN-03 (a mente sobrevive à reconexão) e tick não-bloqueante; (2) um checkpoint humano ao vivo que confirmou raciocínio/conversa LLM, os dois modos de disposição, troca por chat, controle independente e degradação graciosa. O checkpoint também re-confirmou — de forma crítica — o blocker pré-existente de gathering (backlog 999.1), que é dívida da Fase 2 e não um entregável da Fase 3.

## O Que Foi Construído

- **src/cognition/loop.phase3.smoke.test.ts** — smoke headless do loop Fase 3 (bun:test, makeMockBot estendido), 3 testes:
  - **A (D-17):** provider MOCK com `available: async () => false` → ~10 ticks via grafo, loop NÃO lança, cogState resolve via arbiter, memória acumula eventos (agente segue agindo degradado).
  - **B (NEED-01/GOAL-01):** snapshot de vida/fome baixas → `holder.needs` atualizado (survival reflete o snapshot, D-09); goal gerado quando a urgência cruza o limiar.
  - **C (COG-03/Pitfall 3):** provider com `decide` lento (setTimeout) → múltiplos ticks completam ENQUANTO a deliberação está pendente (single-flight fora do grafo); segunda `maybeDeliberate` concorrente NÃO dispara.
- **src/cognition/reconnect.test.ts** — prova CONN-03 a nível de unidade: cria UM `createCognitiveStateHolder`, muta estado (memória, goals, disposition='ASSISTANT', need degradada), simula fim da sessão 1 e início da sessão 2 reusando o MESMO holder, e asserta que memory/goals/disposition/needs são preservados (não resetam). Sem persistência em disco (em-processo apenas — D-20). Comentado referenciando CONN-03/D-20.

## Como Funciona

- **Degradação (D-17):** provider indisponível → o `analyze` cai no arbiter da Fase 2; o loop nunca depende do LLM para agir. Provado headless (Teste A) e ao vivo (LM Studio parado → loop continua, RAM estável, sem crash).
- **CONN-03:** o holder é a fonte única em-processo, criado 1x em `bot/index.ts` e reusado entre sessões; a reconexão troca o `bot` mas não a mente. Provado headless (reconnect.test.ts).
- **Tick não-bloqueante:** a deliberação LLM é single-flight disparada com `void` fora do grafo; o tick reativo não a aguarda.

## Verification Results

### Headless (automatizado)
- `bun test src/cognition/loop.phase3.smoke.test.ts src/cognition/reconnect.test.ts` — 5/5 verdes.
- `bun test` (suite completa) — **160/160 verdes**, sem regressões.
- `bunx tsc --noEmit` — **limpo** (typecheck passou neste ambiente, diferente dos Plans 01/03/04 onde estava bloqueado pelo sandbox).

### Checkpoint humano ao vivo (servidor MC 1.21.4 + LM Studio qwen/qwen3-vl-8b)
Confirmados AO VIVO pelo usuário:
- ✅ **D-07** — AUTONOMOUS ignora conversa ("oi" recebido e ignorado).
- ✅ **D-05** — troca de disposição por chat (`!ajudante` → ASSISTANT).
- ✅ **CHAT-01/02 / D-01/D-02** — conversa coerente, curta, em pt-BR, com persona de sobrevivente pragmático ("Oi. O que você precisa?").
- ✅ **D-13 (camada conversacional)** — pedido de jogador aceito conversacionalmente ("Vou te ajudar a coletar").
- ✅ **Controle independente da disposição** — `!pausar` → idle/paused; `!auto` → retoma autônomo; disposição ASSISTANT preservada durante o pause.
- ✅ **D-17** — LM Studio parado → loop continua degradado ao arbiter (RAM estável, sem crash); LM Studio religado → raciocínio/conversa LLM voltam.
- ⏭️ **CONN-03** — provado headless; não exercitado ao vivo (kick/restart do servidor) nesta sessão.

## Deferred Issues / Blocker Registrado

- **Gathering-OOM (backlog 999.1) — CRÍTICO, dívida da Fase 2.** Quando o arbiter escolhe `gathering` (qualquer bloco da `config.gatheringLadder` por perto — `arbiter.ts:43`), a skill `dig`/pathfinder estoura memória (~12 GB observados ao vivo), trava o tick e derruba o bot do servidor. NÃO é requisito da Fase 3 (os requisitos da fase — COG-03/CONN-03/NEED/GOAL/LLM/CHAT — foram verificados). Mas inutiliza o agente sempre que ele entra em coleta, ferindo na prática o core value (loop autônomo contínuo).
  - **Impacto na verificação ao vivo:** mascarou a observação de D-13 (pedido de coleta virando objetivo executável) e D-15 (preempção por sobrevivência com `resources` ativo). Ambos permanecem provados headless (Plans 02/03/04).
  - **Workaround usado no teste (revertido):** escada de coleta vazia + `NEED_WEIGHT_*_RESOURCES=0` para manter o bot vivo e exercitar chat/disposição/controle/degradação.
  - **Recomendação:** `/gsd:debug` dedicado à raiz do OOM no `dig`/collectBlock/pathfinder (limitar busca, timeout duro, raio efetivo de coleta), rastreado em backlog 999.1.

## Self-Check: PASSED

- Arquivos criados confirmados em disco: src/cognition/loop.phase3.smoke.test.ts, src/cognition/reconnect.test.ts.
- Commits confirmados: b2108e2 (Task 1 smoke), e45642a (Task 2 reconnect), 86d41a3 (types-fix do teste de reconexão).
- Testes: 160/160 verdes na suite completa; tsc --noEmit limpo.
- Mudanças temporárias do checkpoint (log de debug em loop.ts, gatheringLadder vazia em config.ts, resources=0 em .env) REVERTIDAS — `git diff src/` vazio.
