---
phase: 03-cogni-o-com-llm-loop-completo-necessidades-e-objetivos
plan: 04
subsystem: chat
tags: [chat, conversation, disposition, isolation, player-request, security, prompt-injection]
requires:
  - src/control/commands.ts (parseCommand/registerChatCommands — modelo literal/imutável)
  - src/llm/provider.ts (LlmProvider.chat — texto livre conversacional)
  - src/llm/prompts.ts (buildPersonaPrompt — persona estática por disposição; tipo Disposition)
  - src/cognition/state.ts (CognitiveStateHolder: disposition/goals/playerRequestPending)
  - src/motivation/types.ts (Disposition/Goal — fonte estrutural única)
  - src/config.ts (config.proactivity)
provides:
  - "parseDisposition + DISPOSITION_COMMANDS (!ajudante/!sozinho literal — D-05)"
  - "!auto adicionado ao mapa COMMANDS de controle sem remover !livre (D-14)"
  - "shouldRespond + handleConversation (caminho conversacional isolado — CHAT-01/02)"
  - "SUPPORTED_REQUEST_KINDS (conjunto FECHADO gather/follow/navigate — D-13/OQ3)"
  - "handler único de chat no loop com ordem controle->disposição->conversa (Pattern 5)"
affects:
  - "Plan 05 (smoke): pode exercitar o handler unificado controle/disposição/conversa"
tech-stack:
  added: []
  patterns:
    - "Isolamento controle<->disposição<->conversa: três parsers separados, ordem estrita, conversa é o único passo com LLM (Pattern 5 / Pitfall 6)"
    - "Pedido->objetivo restrito a conjunto FECHADO (SUPPORTED_REQUEST_KINDS); fora dele nunca vira objetivo (defesa contra prompt injection, T-03-13)"
    - "handleConversation degrada gracioso: provider.chat em try/catch, nunca propaga (D-17)"
key-files:
  created:
    - src/control/disposition.ts
    - src/control/disposition.test.ts
    - src/chat/conversation.ts
    - src/chat/conversation.test.ts
  modified:
    - src/control/commands.ts
    - src/control/commands.test.ts
    - src/cognition/loop.ts
decisions:
  - "shouldRespond mantém AUTONOMOUS silencioso mesmo com proactivity='proactive' nesta fase (D-07 prioriza silêncio em autônomo); proatividade ativa de conversa fica para iteração futura — _proactivity recebido na assinatura para compatibilidade com o wiring do loop sem mudar o contrato depois."
  - "detectRequestKind é heurística literal por regex de palavras-chave pt/en (sem LLM, sem eval) mapeando ao conjunto fechado; intenção fora do conjunto retorna null => sem objetivo."
  - "Goal de player_request usa priority=1 (alta) para preemptar via selectGoal em ASSISTANT (D-13/D-15b); id inclui timestamp para unicidade."
  - "Handler unificado inlinado no loop substitui registerChatCommands para garantir EXATAMENTE um bot.on('chat') por sessão; registerChatCommands permanece exportado/testado mas sem caller de produção."
  - "handleConversation NÃO escreve memória do comando de chat (paridade com o comportamento atual: o loop chamava registerChatCommands sem onCommand, então nenhum chat_command era persistido)."
metrics:
  tasks: 3
  files_created: 4
  files_modified: 3
  commits: 3
  tests: "16 novos (control 9 + chat 11, descontando overlap de arquivos); 155/155 na suite completa — todos verdes"
  duration_min: ~20
  completed: 2026-06-19
---

# Phase 3 Plan 04: Caminho Conversacional + Eixo de Disposição (Isolado do Controle) Summary

Dá voz coerente ao agente sem deixar a conversa engolir comandos nem violar a separação Fase 2/Fase 3. Entrega o eixo de DISPOSIÇÃO (`!ajudante`/`!sozinho`, D-05) e o alias de controle `!auto` (D-14), além do caminho CONVERSACIONAL (CHAT-01/02) totalmente ISOLADO do parser literal de controle (Pattern 5 / Pitfall 6). O handler de chat do loop aplica a ordem estrita controle → disposição → conversa: os dois primeiros passos são lookups literais imutáveis (imunes a prompt injection); o terceiro é a única conversa com LLM, disparada SÓ quando a disposição/proatividade permite — em AUTONOMOUS a conversa é mínima (D-07). Em ASSISTANT, um pedido de jogador de tipo SUPORTADO (conjunto fechado gather/follow/navigate) vira sinal para objetivo dinâmico restrito (D-13/OQ3); pedido fora do conjunto recebe resposta conversacional educada, nunca um objetivo inválido.

## O Que Foi Construído

- **src/control/disposition.ts** — `DISPOSITION_COMMANDS` (`Object.freeze({ '!ajudante':'ASSISTANT', '!sozinho':'AUTONOMOUS' })`) e `parseDisposition(message)` — match literal exato (trim+lowercase), via `hasOwnProperty` (imune a props herdadas/`__proto__`). Importa `Disposition` de `../llm/prompts`. Nenhum eval/Function — só lookup literal (ASVS V5). — **D-05**
- **src/control/commands.ts** — `'!auto': 'autonomous'` adicionado ao mapa `COMMANDS` mantendo `'!livre': 'autonomous'` (Fase 2 intacta). Nenhuma outra mudança em `parseCommand`. — **D-14**
- **src/chat/conversation.ts** — caminho conversacional isolado:
  - `shouldRespond(disposition, proactivity, username, botUsername)` — false se for a própria mensagem do bot; AUTONOMOUS => false (D-07); ASSISTANT => true (D-12).
  - `SUPPORTED_REQUEST_KINDS = ['gather','follow','navigate']` (conjunto FECHADO — D-13/OQ3).
  - `handleConversation(provider, holder, bot, username, message, now)` — monta `[SystemMessage(buildPersonaPrompt(disposition)), HumanMessage("username: message")]`, chama `provider.chat` em try/catch (NUNCA propaga — degrada para silêncio/log), responde via `bot.chat(reply.slice(0,256))` (curto, D-01). Em ASSISTANT, se `detectRequestKind` casa um tipo suportado: SETA `holder.playerRequestPending=true` e empurra um `Goal` `source:'player_request'` (priority 1). Em AUTONOMOUS pedidos NUNCA viram objetivo. — **CHAT-01/02/03, GOAL-01, D-13**
- **src/cognition/loop.ts** — substitui `registerChatCommands(bot, holder.control)` por UM handler `bot.on('chat')` unificado com a ordem estrita: (1) `parseCommand` → `holder.control.setMode`; (2) `parseDisposition` → `holder.disposition = disp` (troca em runtime); (3) `shouldRespond` → `void handleConversation(...)` (não bloqueia o tick). Exatamente um handler por sessão (Pitfall 6). — **Pattern 5**

## Como Funciona

- **Ordem estrita / isolamento (Pattern 5):** comandos de controle e disposição são parseados ANTES da conversa, por mapas imutáveis com lookup literal exato. Prompt injection no texto livre não muda modo/disposição a menos que seja a keyword exata — e essas keywords nem chegam ao LLM (retornam cedo). A conversa é o ÚNICO passo com LLM e é texto→texto (`bot.chat`); não dirige ação.
- **Pedido → objetivo restrito (D-13/OQ3):** só em ASSISTANT, e só para `gather/follow/navigate`. A heurística é regex literal de palavras-chave pt/en (sem LLM/eval). Fora do conjunto fechado => sem objetivo (a persona responde "não consigo isso ainda"). O `playerRequestPending` é SETADO aqui e RESETADO pelo `observe` (Plan 03) após `selectGoal` consumir o sinal (Plan 02 via `SelectGoalContext`).
- **Degradação graciosa (D-17):** `provider.chat` em try/catch; falha => log + retorno silencioso. O loop reativo nunca depende da conversa (disparada com `void`).

## Reconciliação de Hand-off (Waves 1/2)

- **Disposition única:** `conversation.ts` importa `Disposition` de `src/motivation/types.ts` (fonte estrutural única reconciliada no Plan 03); `disposition.ts` importa de `src/llm/prompts.ts` (a mesma string-literal union, estruturalmente compatível). `buildPersonaPrompt(holder.disposition)` typechecka sem import cruzado forçado — convergência sem acoplamento extra, conforme o Plan 03.
- **playerRequestPending NÃO estendido:** o campo já existe no `CognitiveStateHolder` (Plan 03, default false); este plano apenas SETA o booleano e empurra o goal. Nenhuma mudança estrutural no holder.
- **Conversa isolada do controle literal:** garantido — três parsers separados, um único handler, ordem estrita.

## Deviations from Plan

Nenhum desvio funcional. Decisões de implementação dentro do escopo do plano:

- `shouldRespond` recebe `_proactivity` mas retorna `false` para AUTONOMOUS independentemente do valor (D-07 prioriza silêncio nesta fase). O parâmetro existe para casar a assinatura usada no wiring do loop (`config.proactivity`) sem alterar o contrato em iteração futura. Documentado no código e nos `decisions` do frontmatter.
- `registerChatCommands` permanece exportado e testado em `commands.test.ts`, mas sem caller de produção (o loop agora usa o handler unificado). Mantido como utilitário válido; remover seria escopo de cleanup futuro, não deste plano.

## Deferred Issues

- **`bunx tsc --noEmit` bloqueado pelo sandbox:** mesmo bloqueio relatado nos SUMMARYs dos Plans 01 e 03 — todos os comandos de typecheck (`bunx tsc`, `bun run typecheck`) foram negados pelo ambiente desta execução. A verificação de tipos foi feita via `bun test` (type-stripping + execução) sobre a suite inteira (155/155 verdes), incluindo os 16 testes novos que exercitam parseDisposition, shouldRespond, handleConversation, mapeamento pedido→objetivo e o wiring. As assinaturas foram reconciliadas manualmente (Disposition de prompts/types compatíveis; LlmProvider.chat; Goal). Risco de tipo residual: baixo. **Recomenda-se rodar `bun run typecheck` no merge do orchestrator** (onde os hooks são validados).

## Verification Results

- `bun test src/control/ src/chat/` — 27/27 verdes (16 novos + os 11 pré-existentes de commands).
- `bun test` (suite completa) — 155/155 verdes, sem regressões.
- grep prova ordem controle→disposição→conversa em `src/cognition/loop.ts` (parseCommand antes de parseDisposition antes de shouldRespond).
- `grep -c "bot.on('chat'" src/cognition/loop.ts` === 1 (um handler por sessão — Pitfall 6); `registerChatCommands` sem caller de produção.
- `'!auto'` e `'!livre'` ambos presentes em `commands.ts` (D-14 não quebra Fase 2).
- `grep -rn "eval|Function("` em `disposition.ts` retorna apenas comentários (sem código eval) — segurança literal.
- `provider.chat`/`buildPersonaPrompt`/`SUPPORTED_REQUEST_KINDS`/`bot.chat` presentes em `conversation.ts`.

## Authentication Gates

Nenhum gate atingido. **User setup em runtime (não bloqueante):** habilitar o servidor do LM Studio e configurar `LLM_BASE_URL`/`LLM_MODEL`. Sem isso, `provider.chat` falha e `handleConversation` degrada para silêncio (log) — o loop reativo continua rodando normalmente (D-17).

## Known Stubs

- **Proatividade de conversa em AUTONOMOUS:** `shouldRespond` ignora `proactivity` e mantém AUTONOMOUS silencioso (D-07). Intencional nesta fase; cumprimentar quem chega / proatividade ativa fica para iteração futura. Não impede o objetivo do plano (a conversa ASSISTANT funciona plenamente).
- **detectRequestKind heurístico:** detecção de intenção por palavras-chave literais (não LLM). Cobre o conjunto fechado gather/follow/navigate; pedidos ambíguos podem não casar (degradam para resposta conversacional, nunca objetivo inválido — comportamento seguro por design, T-03-13).

## Threat Flags

Nenhuma superfície de segurança nova além do `<threat_model>` do plano. Mitigações implementadas: parsers literais imutáveis parseados antes da conversa (T-03-12); objetivo extraível restrito a SUPPORTED_REQUEST_KINDS fechado (T-03-13); conversa texto→texto sem dirigir ação, AUTONOMOUS off (T-03-14); um handler por sessão, conversa void/não-bloqueante (T-03-15).

## Self-Check: PASSED

- Arquivos criados confirmados em disco: src/control/disposition.ts, src/control/disposition.test.ts, src/chat/conversation.ts, src/chat/conversation.test.ts.
- Arquivos modificados confirmados: src/control/commands.ts, src/control/commands.test.ts, src/cognition/loop.ts.
- Commits confirmados: a0f17c4 (Task 1), 6a653ab (Task 2), 32197d6 (Task 3).
- Testes: 155/155 verdes na suite completa.
