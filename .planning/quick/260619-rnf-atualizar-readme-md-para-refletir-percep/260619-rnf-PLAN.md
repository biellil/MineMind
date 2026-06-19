---
phase: quick-260619-rnf
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: [README.md]
autonomous: true
requirements: [DOC-README-PERCEPCAO-PROCESSAMENTO]

must_haves:
  truths:
    - "Quem lê o README entende o que a camada de percepção captura HOJE (status, entidades, jogadores, tipos de bloco, inventário, lookingAt, underfoot)"
    - "Quem lê o README entende como o loop cognitivo processa a percepção HOJE (grafo finito-por-tick reativo + deliberação LLM lenta single-flight fora do grafo)"
    - "O README menciona explicitamente os campos recém-enriquecidos: lookingAt (bloco na mira), underfoot (bloco sob os pés) e a renderização de entities/mobs no prompt"
    - "As descrições refletem o código REAL (não comportamento aspiracional/futuro)"
  artifacts:
    - path: "README.md"
      provides: "Documentação atual de percepção e processamento do MineMind em pt-BR"
      min_lines: 40
  key_links:
    - from: "README.md (seção Percepção)"
      to: "src/perception/types.ts + src/perception/snapshot.ts"
      via: "descrição fiel do contrato WorldSnapshot e do buildWorldSnapshot"
      pattern: "lookingAt|underfoot|WorldSnapshot"
    - from: "README.md (seção Processamento)"
      to: "src/cognition/loop.ts + graph.ts + deliberation.ts"
      via: "descrição do loop reativo + deliberação lenta single-flight"
      pattern: "observe|analyze|deliberac|single-flight"
---

<objective>
Atualizar o `README.md` (hoje só título + tagline) para descrever com fidelidade como a **percepção** e o **processamento (loop cognitivo)** do MineMind funcionam ATUALMENTE, incluindo o enriquecimento recente da percepção (`lookingAt`, `underfoot` e render de entidades/mobs no prompt).

Purpose: O README é a porta de entrada do projeto de pesquisa; precisa refletir o estado real do código para servir de referência confiável a quem estuda a arquitetura.
Output: `README.md` com seções de Percepção e Processamento em pt-BR, descrevendo comportamento real (não aspiracional).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@README.md
@src/perception/types.ts
@src/perception/snapshot.ts
@src/llm/prompts.ts
@src/cognition/loop.ts
@src/cognition/graph.ts
@src/cognition/nodes.ts
@src/cognition/deliberation.ts

<interfaces>
<!-- Fonte da verdade para a documentação. O executor deve descrever EXATAMENTE estes campos/comportamentos — sem inventar nem omitir. -->

WorldSnapshot (src/perception/types.ts) — objeto imutável (deep-frozen via structuredClone + Object.freeze):
- capturedAt: number (timestamp Unix ms)
- status: { health 0–20, food 0–20, position {x,y,z}, timeOfDay (0..1; ticks <13000 = dia), isDay }
- entities: EntityInfo[] — mobs/objetos no raio (config.perceptionRadius), ordenados por distância (id, type, name, position, distance, health|null, metadata)
- players: PlayerInfo[] — jogadores próximos (username, displayName, gamemode, ping, position|null, distance|null)
- nearbyBlockTypes: Record<nome, { count, examples (até 3 posições) }> — RESUMO por tipo (D-07), não serializa bloco a bloco; findBlocks com count:200, exclui ar
- inventory: InventorySlot[] — inventário completo slot-a-slot (slot, name, type, count, metadata, nbt)
- lookingAt: { name, position, distance } | null — bloco na mira via bot.blockAtCursor(5)  [ENRIQUECIMENTO RECENTE]
- underfoot: string — nome do bloco sob os pés via bot.blockAt(pos.offset(0,-1,0)); "unknown" se indisponível  [ENRIQUECIMENTO RECENTE]

buildWorldSnapshot(bot): WorldSnapshot (src/perception/snapshot.ts)
- Chamar SÓ após bot.once('spawn'). A camada cognitiva NUNCA recebe o objeto bot — só o snapshot.

serializeContext(snapshot, needs, goals, recentEvents) (src/llm/prompts.ts)
- Compacta o snapshot p/ o prompt do LLM: Status, até 8 tipos de bloco, até 5 jogadores, "Na mira" (lookingAt), "Sob os pés" (underfoot), até 5 entidades/mobs [render RECENTE], needs/goals e ~10 eventos recentes.

Loop cognitivo (src/cognition/):
- graph.ts: StateGraph FINITO por tick: START→observe→analyze→updateMemory→decide→execute→END. Checkpointer MemorySaver (em memória, Bun-safe).
- loop.ts: driver externo single-flight; re-invoca o grafo a cada tick (config.minTickMs). A cada tick dispara maybeDeliberate SEM bloquear o tick (void). Gatilho de reflexão híbrido. Persiste a "mente" ao disco (flush periódico + no end da sessão).
- nodes.ts: observe = buildWorldSnapshot + motivação (needs/goals por disposição); analyze = prefere decisão LLM FRESCA do holder, senão arbiter determinístico (fallback); execute = no máximo UMA skill (single-flight: dig/navigate).
- deliberation.ts: deliberação LLM "lenta" FORA do grafo, single-flight (nunca 2 inferências concorrentes), event-driven, com orçamento de replan; escreve a decisão no holder p/ o analyze ler pronta. Reusa o mesmo lock p/ a reflexão.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Documentar Percepção no README</name>
  <files>README.md</files>
  <action>
    Reler primeiro `src/perception/types.ts`, `src/perception/snapshot.ts` e `src/llm/prompts.ts` para confirmar o comportamento ATUAL (descrever o que o código faz, NUNCA features futuras).

    Manter o título "# MineMind" e a tagline existentes. Adicionar (em pt-BR) uma seção `## Percepção` que explique:
    - A percepção é capturada por `buildWorldSnapshot(bot)` (src/perception/snapshot.ts), que produz um `WorldSnapshot` imutável (deep-frozen) — a camada cognitiva nunca recebe o objeto `bot`, só o snapshot.
    - O que o snapshot contém HOJE, idealmente como uma tabela campo→descrição: `status` (vida, fome, posição, timeOfDay/isDay), `entities` (mobs/objetos no raio `perceptionRadius`, ordenados por distância), `players`, `nearbyBlockTypes` (RESUMO por tipo com count + até 3 posições de exemplo — não serializa bloco a bloco), `inventory` (slot-a-slot completo).
    - Destacar o ENRIQUECIMENTO RECENTE: `lookingAt` (bloco na mira via `bot.blockAtCursor(5)`, ou `null`) e `underfoot` (nome do bloco sob os pés, `"unknown"` se indisponível).
    - Mencionar que o snapshot é compactado para o prompt do LLM por `serializeContext` (src/llm/prompts.ts), que hoje inclui "Na mira" (lookingAt), "Sob os pés" (underfoot) e até ~5 entidades/mobs próximos — partes do mesmo enriquecimento recente.

    Não inventar campos. Espelhar exatamente os campos listados no bloco <interfaces>.
  </action>
  <verify>
    <automated>node -e "const t=require('fs').readFileSync('README.md','utf8'); const need=['## Percep','lookingAt','underfoot','WorldSnapshot','nearbyBlockTypes','serializeContext']; const miss=need.filter(k=>!t.includes(k)); if(miss.length){console.error('Faltando:',miss.join(', '));process.exit(1)} console.log('Percepção OK')"</automated>
  </verify>
  <done>README.md tem seção `## Percepção` em pt-BR descrevendo WorldSnapshot, nearbyBlockTypes, serializeContext e os campos enriquecidos lookingAt + underfoot, fiel ao código.</done>
</task>

<task type="auto">
  <name>Task 2: Documentar Processamento (loop cognitivo) no README</name>
  <files>README.md</files>
  <action>
    Reler primeiro `src/cognition/loop.ts`, `src/cognition/graph.ts`, `src/cognition/nodes.ts` e `src/cognition/deliberation.ts` para confirmar o comportamento ATUAL.

    Adicionar (em pt-BR) uma seção `## Processamento` (ou `## Loop Cognitivo`) que explique:
    - O processamento é um `StateGraph` FINITO por tick (src/cognition/graph.ts): `START → observe → analyze → updateMemory → decide → execute → END`, com checkpointer `MemorySaver` (em memória, Bun-safe). A "aresta de retorno" é o driver externo.
    - O driver é `loop.ts`: re-invoca o grafo a cada tick (respeitando `config.minTickMs`), single-flight, e persiste a "mente" ao disco (flush periódico e ao encerrar a sessão).
    - O que cada nó faz HOJE (src/cognition/nodes.ts): `observe` constrói o snapshot e roda a motivação (needs/goals por disposição); `analyze` prefere a decisão LLM FRESCA do holder e, na ausência dela, degrada para o arbiter determinístico (fallback); `execute` dispara NO MÁXIMO uma skill por tick (single-flight: ex. dig / navigate).
    - Ponto-chave da arquitetura: o tick reativo rápido NUNCA espera o LLM. A deliberação "lenta" do LLM (src/cognition/deliberation.ts) roda FORA do grafo, single-flight (nunca duas inferências concorrentes), event-driven e com orçamento de replan; ela escreve a decisão no holder para o `analyze` ler pronta. O mesmo lock single-flight é reusado pela reflexão.
    - Resumir o ciclo cognitivo central como perceber → decidir → agir (alinhado ao core value do projeto).

    Opcional: um pequeno diagrama em texto/ASCII do fluxo do grafo. Não documentar fases/skills futuras como se já existissem.
  </action>
  <verify>
    <automated>node -e "const t=require('fs').readFileSync('README.md','utf8'); const need=['observe','analyze','execute','single-flight','delibera']; const miss=need.filter(k=>!t.toLowerCase().includes(k.toLowerCase())); if(miss.length){console.error('Faltando:',miss.join(', '));process.exit(1)} console.log('Processamento OK')"</automated>
  </verify>
  <done>README.md tem seção de Processamento/Loop Cognitivo em pt-BR descrevendo o grafo finito-por-tick (observe/analyze/.../execute), o driver single-flight e a deliberação LLM lenta fora do grafo, fiel ao código.</done>
</task>

</tasks>

<verification>
- README.md mantém título e tagline originais e adiciona seções de Percepção e Processamento.
- Ambos os comandos de verify automatizados passam (campos-chave presentes).
- Conferência manual de fidelidade: cada afirmação do README mapeia a algo em src/perception/* ou src/cognition/*; nenhuma feature aspiracional/futura descrita como atual.
- Texto inteiramente em pt-BR.
</verification>

<success_criteria>
- Um leitor novo entende, só pelo README, o que o MineMind percebe hoje e como processa essa percepção.
- lookingAt, underfoot e o render de entidades/mobs no prompt estão explicitamente documentados como parte da percepção atual.
- Descrições são fiéis ao código real (verificadas relendo os fontes antes de escrever).
</success_criteria>

<output>
Após a conclusão, criar `.planning/quick/260619-rnf-atualizar-readme-md-para-refletir-percep/260619-rnf-SUMMARY.md`.
</output>
