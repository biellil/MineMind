---
phase: quick-260622-nif
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/chat/conversation.ts
  - src/chat/conversation.test.ts
  - src/cognition/loop.ts
  - src/cognition/concurrency-wiring.test.ts
autonomous: true
requirements: [NIF-01, NIF-02, NIF-03]

must_haves:
  truths:
    - "Em AUTONOMOUS, o jogador recebe resposta no chat (antes era silêncio por D-07)"
    - "Em ASSISTANT, o jogador continua recebendo resposta no chat"
    - "Em ambos os modos, responder ao jogador NÃO aborta a ação/tarefa em voo"
    - "O bot nunca responde à própria mensagem (guard username === botUsername)"
    - "Turnos de player sobrepostos continuam descartados (gate 'player' single-flight)"
  artifacts:
    - path: "src/chat/conversation.ts"
      provides: "shouldRespond responde em AUTONOMOUS e ASSISTANT"
      contains: "export function shouldRespond"
    - path: "src/cognition/loop.ts"
      provides: "routePlayerTurn sem preempção de ação + wiring sem abort"
      contains: "routePlayerTurn"
  key_links:
    - from: "src/cognition/loop.ts (bot.on('chat'))"
      to: "routePlayerTurn"
      via: "void routePlayerTurn(llmSemaphore, taskGate, run)"
      pattern: "routePlayerTurn\\(llmSemaphore"
    - from: "routePlayerTurn"
      to: "semaphore.acquire(0)"
      via: "prioridade player=0 (fura a fila, espera o permit, NÃO aborta)"
      pattern: "acquire\\(0\\)"
---

<objective>
No modo AUTONOMOUS a IA passa a responder o jogador no chat, e em NENHUM modo (AUTONOMOUS ou ASSISTANT) o turno de resposta aborta a ação/tarefa em voo — a resposta roda em paralelo, coordenada apenas pelo gate por tipo + semáforo (prioridade player=0).

Esta é uma REVERSÃO CONSCIENTE de doutrina anterior:
- D-07 ("AUTONOMOUS = conversa mínima/silêncio") → agora responde nos dois modos.
- D-12 ("player preempta a AÇÃO" via `actionAbort.abort()`) → o turno de player deixa de abortar.

Propósito: comportamento de chat uniforme e não-destrutivo — a IA conversa enquanto continua executando seu objetivo, sem perder trabalho em voo.

Output: `shouldRespond` respondendo em ambos os modos; `routePlayerTurn` sem o parâmetro/efeito de preempção; wiring do `bot.on('chat')` sem passar o abort; testes atualizados (os que afirmam o comportamento antigo VÃO quebrar e são corrigidos aqui).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

@src/chat/conversation.ts
@src/cognition/loop.ts
@src/cognition/concurrency.ts
@src/chat/conversation.test.ts
@src/cognition/concurrency-wiring.test.ts

<interfaces>
<!-- Contratos relevantes já existentes no código (use direto, sem explorar). -->

shouldRespond (src/chat/conversation.ts) — assinatura ATUAL (manter assinatura, mudar corpo):
```typescript
export function shouldRespond(
  disposition: Disposition,         // 'AUTONOMOUS' | 'ASSISTANT'
  _proactivity: 'reactive' | 'proactive',
  username: string,
  botUsername: string,
): boolean
// hoje: username === botUsername => false; ASSISTANT => true; AUTONOMOUS => false (D-07)
```

routePlayerTurn (src/cognition/loop.ts) — assinatura ATUAL (vamos remover preemptAction):
```typescript
export async function routePlayerTurn(
  semaphore: Semaphore,
  gate: ReturnType<typeof createTaskGate>,
  preemptAction: () => void,   // <-- REMOVER este parâmetro
  run: () => Promise<void>,
): Promise<void>
```

Semáforo (src/cognition/concurrency.ts) — `acquire(priority)` resolve já se há permit, senão enfileira ordenado por prioridade (player=0 fura a frente, espera o permit). Isto JÁ garante "paralelo sem abortar": o player não rouba o slot da ação à força, só fura a fila e roda quando há permit. Com `maxConcurrency >= 2` (cloud) sobrepõe de verdade; com `maxConcurrency = 1` (local, default) serializa — trade-off documentado abaixo, NÃO mudar o default.

Wiring atual no bot.on('chat') (src/cognition/loop.ts:230-234):
```typescript
if (shouldRespond(holder.disposition, config.proactivity, username, bot.username)) {
  void routePlayerTurn(llmSemaphore, taskGate, () => actionAbort?.abort(), () =>
    handleConversation(provider, holder, bot, username, message, Date.now()),
  )
}
```

shouldPreemptAction (src/cognition/loop.ts:560) — função pura `(hasPlayerTurn, actionInFlight) => boolean`. Fica ÓRFÃ após esta mudança (só existia para suportar a preempção). Remover a função e seu teste.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: shouldRespond responde em AUTONOMOUS e ASSISTANT (reverte D-07)</name>
  <files>src/chat/conversation.ts, src/chat/conversation.test.ts</files>
  <behavior>
    - shouldRespond('AUTONOMOUS', 'reactive', 'Steve', 'MineMind') === true (NOVO — reverte D-07)
    - shouldRespond('AUTONOMOUS', 'proactive', 'Steve', 'MineMind') === true
    - shouldRespond('ASSISTANT', 'reactive', 'Steve', 'MineMind') === true (inalterado)
    - shouldRespond('ASSISTANT', 'reactive', 'MineMind', 'MineMind') === false (guard de auto-mensagem)
    - shouldRespond('AUTONOMOUS', 'proactive', 'MineMind', 'MineMind') === false (guard de auto-mensagem)
  </behavior>
  <action>
    Em src/chat/conversation.ts, função `shouldRespond` (linhas ~56-65): manter o guard `if (username === botUsername) return false`, mas fazer ambos os modos responderem. Substituir o corpo após o guard por `return true` (a IA responde a qualquer jogador próximo nos dois modos).

    Atualizar o doc-comment da função (linhas ~48-54) e o comentário inline removendo a doutrina de "AUTONOMOUS = silêncio (D-07)". Documentar a REVERSÃO explicitamente, ex.: "Reverte D-07: AUTONOMOUS agora também responde — comportamento de chat uniforme. O guard de auto-mensagem (Pitfall 5) permanece." Manter `_proactivity` no parâmetro (assinatura inalterada; o prefixo `_` segue indicando não-uso).

    NÃO mexer em `handleConversation`, `detectRequestKind` nem na lógica de objetivo dinâmico (o gate `disposition === 'ASSISTANT'` para gerar `player_request` continua só em ASSISTANT — fora do escopo desta mudança).

    Em src/chat/conversation.test.ts: o teste 'shouldRespond: AUTONOMOUS reactive => false (D-07 conversa mínima)' (linha ~34) afirma o comportamento ANTIGO e VAI quebrar — reescrevê-lo para asserir `true` e renomear para refletir a nova doutrina (ex.: 'shouldRespond: AUTONOMOUS reactive => true (responde em ambos os modos)'). Manter os testes de ASSISTANT=>true e os de guard de auto-mensagem. Confirmar que os 3 últimos testes de objetivo dinâmico (ASSISTANT gera goal / AUTONOMOUS NUNCA gera goal) continuam válidos — eles testam `handleConversation`, que não muda.
  </action>
  <verify>
    <automated>bun test src/chat/conversation.test.ts</automated>
  </verify>
  <done>shouldRespond retorna true em AUTONOMOUS e ASSISTANT (exceto auto-mensagem); todos os testes de conversation.test.ts passam; doc-comment documenta a reversão de D-07.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: routePlayerTurn para de abortar a ação + wiring sem preempção (reverte D-12)</name>
  <files>src/cognition/loop.ts, src/cognition/concurrency-wiring.test.ts</files>
  <behavior>
    - routePlayerTurn(semaphore, gate, run): entra no gate 'player', adquire o semáforo com prioridade 0, roda `run`, libera gate+semáforo no finally (mesmo com throw) — SEM nenhuma chamada de abort.
    - gate 'player' já ocupado → descarta o turno (run não é chamado). Single-flight por tipo preservado.
    - prioridade 0 ainda fura a frente da fila do semáforo (espera o permit, não rouba à força).
    - Nenhuma ação em voo é abortada ao despachar um turno de player.
  </behavior>
  <action>
    Reverte D-12 (player preempta a ação). A coordenação some APENAS no abort — o gate 'player' e a prioridade 0 no semáforo permanecem.

    Em src/cognition/loop.ts:
    1. `routePlayerTurn` (~539-554): REMOVER o parâmetro `preemptAction: () => void` e a linha `preemptAction()` (linha ~546). A função fica `routePlayerTurn(semaphore, gate, run)`. Manter `gate.tryEnter('player')` no início (descarte de turno duplicado), `await semaphore.acquire(0)`, e o try/finally com `semaphore.release()` + `gate.leave('player')`. Atualizar o doc-comment removendo a menção à preempção/abort (D-12) e documentar a REVERSÃO: ex. "Reverte D-12: o turno de player NÃO aborta mais a ação em voo — roda em paralelo, coordenado só pelo gate por tipo + prioridade 0 no semáforo. Com maxConcurrency=1 (local) serializa por permit; com >=2 (cloud) sobrepõe."
    2. `shouldPreemptAction` (~556-562): REMOVER a função inteira — fica órfã sem a preempção.
    3. Wiring no `bot.on('chat')` (~230-234): trocar a chamada para `void routePlayerTurn(llmSemaphore, taskGate, () => handleConversation(provider, holder, bot, username, message, Date.now()))` — sem o argumento `() => actionAbort?.abort()`. Atualizar o comentário inline (~228-229) removendo "preemptando a AÇÃO em voo (D-12)" e anotando a reversão (responde em paralelo, sem abortar).
    4. `actionAbort` (declarado ~167): verificar se ainda é usado em OUTRO ponto além do player turn. Se o ÚNICO uso for o do wiring removido, remover a declaração `let actionAbort` e os pontos que o setam/passam para o dispatch de ação (e o comentário D-12 da linha ~165-166). Se `actionAbort` ainda for usado pelo dispatch de ação por OUTRO motivo (ex.: timeout/sessionAbort), mantê-lo intacto — apenas pare de abortá-lo a partir do turno de player. Fazer a mudança MÍNIMA: usar grep no arquivo por `actionAbort` antes de decidir; preferir manter se houver qualquer outro consumidor.

    Em src/cognition/concurrency-wiring.test.ts: os 4 testes de `routePlayerTurn` passam um `preempt` mock e/ou asseriam `preempt.mock.calls` — VÃO quebrar. Reescrevê-los:
    - 'entra no gate player, ... adquire/libera o semáforo': remover `preempt`, chamar `routePlayerTurn(semaphore, gate, run)`, remover a asserção de `preempt`. Asserir que `run` foi chamado 1x e gate/semáforo liberados.
    - 'libera gate e semáforo mesmo quando run lança': remover `preempt`, asserir liberação no throw.
    - 'gate player já ocupado → descarta o turno': remover `preempt` e a asserção `preempt...toBe(0)`; manter `run...toBe(0)` (descarte).
    - 'prioridade 0 (player) fura a frente da fila': trocar `routePlayerTurn(semaphore, gate, () => {}, async ...)` por `routePlayerTurn(semaphore, gate, async ...)`.
    - REMOVER o teste 'shouldPreemptAction: ...' (a função não existe mais).
    - Adicionar 1 teste novo afirmando a NÃO-preempção, ex.: 'routePlayerTurn: NÃO aborta a ação em voo (reverte D-12)' — como `preemptAction` foi removido, basta garantir que a assinatura não aceita/usa abort (o teste documenta a intenção: nenhum efeito colateral de abort; `run` roda e o resto do sistema fica intacto).
  </action>
  <verify>
    <automated>bun test src/cognition/concurrency-wiring.test.ts</automated>
  </verify>
  <done>routePlayerTurn não recebe nem chama preemptAction; shouldPreemptAction removida; wiring do bot.on('chat') não passa o abort; concurrency-wiring.test.ts passa com os testes reescritos + o teste de não-preempção; doc-comments documentam a reversão de D-12.</done>
</task>

<task type="auto">
  <name>Task 3: Suíte completa verde + typecheck (sem regressões)</name>
  <files>src/cognition/loop.ts, src/chat/conversation.ts</files>
  <action>
    Rodar a suíte inteira e o typecheck para garantir que a remoção do parâmetro `preemptAction` e da função `shouldPreemptAction` não deixou referências órfãs em nenhum outro arquivo (imports de `shouldPreemptAction`, chamadas de `routePlayerTurn` com aridade antiga, `actionAbort` órfão). Se o typecheck/teste apontar qualquer referência quebrada, corrigir com a mudança mínima coerente. Não re-arquitetar o loop.
  </action>
  <verify>
    <automated>bun test && bunx tsc --noEmit</automated>
  </verify>
  <done>Toda a suíte de testes passa; `tsc --noEmit` sem erros; nenhuma referência órfã a shouldPreemptAction/preemptAction/actionAbort.</done>
</task>

</tasks>

<verification>
- `shouldRespond` retorna true para AUTONOMOUS e ASSISTANT (exceto quando username é o próprio bot).
- `routePlayerTurn` não tem parâmetro de preempção e nenhuma chamada de abort no caminho do player.
- Wiring `bot.on('chat')` chama `routePlayerTurn` com 3 args (sem o abort).
- Gate 'player' single-flight preservado (turno duplicado descartado) e prioridade 0 mantida.
- `bun test` (suíte completa) verde; `bunx tsc --noEmit` limpo.
</verification>

<success_criteria>
- No modo AUTONOMOUS, mensagem de jogador dispara resposta (verificável: teste de shouldRespond + caminho de wiring).
- Em AUTONOMOUS e ASSISTANT, despachar a resposta NÃO aborta a ação em voo (preempção removida).
- Comportamento uniforme entre os dois modos (mesmo caminho `routePlayerTurn`, mesma decisão `shouldRespond`).
- Comentários no código documentam que é reversão intencional de D-07 e D-12.
- Testes que afirmavam o comportamento antigo foram atualizados; suíte verde.
</success_criteria>

<output>
Após completar, criar `.planning/quick/260622-nif-no-modo-autonomous-a-ia-responde-ao-joga/260622-nif-SUMMARY.md`.
</output>
