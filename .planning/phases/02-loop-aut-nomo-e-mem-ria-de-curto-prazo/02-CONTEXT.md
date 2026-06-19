# Phase 2: Loop Autônomo e Memória de Curto Prazo - Context

**Gathered:** 2026-06-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Implementar o loop cognitivo cíclico real como um `StateGraph` do LangGraph com aresta de retorno, rodando continuamente com **nós de regra fixa (sem nenhum LLM)**. O agente alterna entre estados cognitivos básicos (Idle, Exploring, Gathering, Socializing; Fighting e Building como stub) por regras fixas, vagueia/coleta de forma autônoma e visível usando os skills da Fase 1, detecta repetição/ausência de progresso (rede de segurança) e mantém uma memória de curto prazo limitada (ring buffer) com esqueleto de orçamento de tokens já presente antes do LLM existir.

Requisitos cobertos: COG-01, COG-02, COG-04, MEM-01.

**Fora do escopo desta fase (adiado deliberadamente):**
- Qualquer chamada a LLM, deliberação ou conversa coerente (Fase 3 — CHAT-01/02/03, LLM-01/02/03, COG-03).
- Sistema de necessidades que decaem e objetivos dinâmicos priorizados com histerese/comprometimento rico (Fase 3 — NEED-01/02, GOAL-01/02).
- Persistência de longo prazo, recuperação semântica, reflexão, perfis sociais (Fase 4 — MEM-02/03, REFL-01, SOC-01/02).
- Estado cognitivo durável que sobrevive a reconexão (Fase 3 — CONN-03).

</domain>

<decisions>
## Implementation Decisions

### Arquitetura do Loop (COG-01)

- **D-01:** O loop é um `StateGraph` do LangGraph (JS) com aresta de retorno, conforme o roadmap (locked). Os nós seguem o ciclo Observe → Analyze → Update Memory → (Evaluate/Decide por regra fixa) → Plan → Execute → repete. Sem LLM em nenhum nó.
- **D-02:** **Cadência: tick fixo single-flight, bloqueante na skill.** O grafo roda uma volta, dispara **no máximo uma** skill e **aguarda ela concluir** (via `executeWithSafety`, que já tem timeout/watchdog) antes do próximo tick. Há um intervalo mínimo configurável entre voltas (sugestão: ~500ms). Isso garante single-flight natural — nenhuma ação sobreposta — e prepara o terreno para as "duas taxas" da Fase 3 sem implementá-las agora.
- **D-03:** **Checkpointer: `MemorySaver` (em memória) do LangGraph.** Sem disco, sem `better-sqlite3` (incompatível com Bun — ver D-02 da Fase 1). O estado vive no processo e reinicia do zero a cada start — aceitável porque persistência real é deliberadamente Fase 4. NÃO antecipar `bun:sqlite` aqui.
- **D-04:** O loop opera exclusivamente sobre o `WorldSnapshot` imutável (contrato da Fase 1) — nunca recebe referência ao objeto `bot` (carrega D-10 da Fase 1). Skills são executadas por nome via `skillRegistry`.

### Estados Cognitivos e Política de Transição (COG-02)

- **D-05:** **Arbitragem por prioridade fixa**, avaliada de cima para baixo a cada decisão:
  `Socializing` (jogador próximo) > `Gathering` (alvo de coleta presente no raio) > `Exploring` (caso contrário) > `Idle` (fallback). Determinístico e fácil de depurar — adequado à espinha sem-LLM.
- **D-06:** Estados a implementar como nós/ramos funcionais: **Idle, Exploring, Gathering, Socializing**. **Fighting e Building presentes como stub** (entram no enum/máquina mas sem lógica real, retornando imediatamente — espelha o padrão de stub das skills `follow`/`attack` da Fase 1).
- **D-07:** **Gathering por escada de prioridade de sobrevivência, configurável.** Objetivo do agente: **sobreviver e ficar mais forte**. Nada hardcoded/arbitrário — uma lista priorizada de tipos de bloco-alvo em config, orientada à progressão de sobrevivência (ex.: madeira → ferramentas → pedra → minérios; comida quando faminto). O agente coleta o alvo de maior prioridade presente em `snapshot.nearbyBlockTypes`. **Importante:** isto é uma escada de regra fixa, NÃO o sistema de necessidades que decaem nem objetivos dinâmicos — esses são Fase 3 (NEED/GOAL).

### Modo de Controle por Comando de Chat (decisão do usuário — incluído na Fase 2)

- **D-08:** Implementar uma **máquina de modo de controle** por cima dos estados cognitivos, com três modos: **Autônomo** (padrão — faz o que quiser por regra fixa), **Pausado** (fica parado, não age), **Standby** (vem para perto de um jogador e aguarda ordens, sem agir autonomamente).
- **D-09:** O gatilho dos modos é um **parser de comando literal no chat** — leitura de palavra-chave exata, **sem nenhuma interpretação por LLM** (ex.: `!pausar` → Pausado; `!vem`/`!aqui` → Standby; `!livre` → Autônomo). Palavras-chave exatas ficam a critério do planner/Claude. **Escopo:** apenas comando literal → ação. **Conversa coerente com o jogador continua sendo Fase 3 (CHAT-01).**
- **Racional:** dá um *freio de segurança* sobre o loop autônomo desde o início (pausar um agente que se comporte mal), permanece 100% sem-LLM, e separa limpo o parsing de comando da conversa conversacional da Fase 3 ("cada guarda precede o que ela protege").

### Anti-Repetição e Robustez (COG-04)

- **D-10:** **Rede de segurança mínima**, não comprometimento/histerese pesado. Detecta quando a mesma ação se repete N vezes **sem progresso** e força o agente a abandonar e tentar outra coisa (ou cair para Idle). O "comprometimento" rico (segurar alvo por muitos ticks, histerese de objetivos) é deliberadamente deixado para o LLM/sistema de objetivos da Fase 3 — para não engessar o LLM futuro. Esta rede mínima é a guarda exigida por COG-04 que precede o LLM.
- **D-11:** **Reação a falha de skill (timeout/stuck do executor): backoff leve** (critério do Claude). Marca o alvo como "falho" com cooldown curto, incrementa contador de tentativas e escolhe outro alvo/estado; após M falhas consecutivas, cai para Idle e espera. Evita martelar o mesmo obstáculo. Reutiliza os erros já existentes do executor (`SkillTimeoutError`, `SkillStuckError`).

### Memória de Curto Prazo (MEM-01)

- **D-12:** **Ring buffer de eventos ricos.** Grava: transições de estado, ações executadas + resultado (sucesso/falha), eventos do mundo relevantes (dano, fome, jogador chegou/saiu) e comandos de chat recebidos. Cada entrada com **timestamp e tipo** discriminado. Contrato rico que a Fase 3 (LLM) consome diretamente como contexto.
- **D-13:** **Evicção por orçamento de tokens desde já.** O buffer é limitado por um orçamento de tokens **estimado** (heurística ~4 chars/token sobre o texto serializado de cada entrada), com evicção **FIFO** quando o orçamento estoura. O esqueleto de orçamento fica pronto para a Fase 3 plugar o tokenizer real do modelo. Atende explicitamente o critério "esqueleto de orçamento de tokens já presente antes do LLM" (MEM-01 / Critério #4).

### Claude's Discretion

- Valor exato do intervalo mínimo entre ticks (sugestão: ~500ms) e parâmetros de timeout por estado.
- Palavras-chave exatas dos comandos de chat (`!pausar`, `!vem`, `!livre` ou similares).
- Valores de N (repetições antes de abandonar), M (falhas antes de Idle) e do orçamento de tokens padrão.
- Taxonomia exata dos tipos de evento da memória e formato de serialização para a estimativa de tokens.
- Estratégia de logging/observabilidade do loop (console de transições de estado para tornar o comportamento "visível" — Critério #2).
- Estrutura de diretórios dos novos módulos (sugestão: `src/cognition/` para o grafo, `src/memory/` para o ring buffer).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Specs
- `.planning/ROADMAP.md` — Phase 2 goal, success criteria (4 critérios), e mapeamento de requisitos (COG-01/02/04, MEM-01). Inclui a filosofia "cada guarda precede o que ela protege".
- `.planning/REQUIREMENTS.md` — Definições completas de COG-01, COG-02, COG-04, MEM-01 (e o contexto de COG-03/NEED/GOAL que NÃO entram aqui).
- `.planning/PROJECT.md` — Constraints (Bun runtime, TypeScript all-in, LangGraph para o loop, LM Studio só na Fase 3, servidor local). Core value: o loop cognitivo (perceber → decidir → agir) precisa funcionar.

### Prior Phase Context (decisões que esta fase carrega)
- `.planning/phases/01-presen-a-e-conex-o-funda-o-sem-llm/01-CONTEXT.md` — D-10 (snapshot imutável; camada cognitiva nunca toca o bot), D-13 (executor centralizado reutilizado), D-11 (skills como `skillRegistry` + schemas Zod), D-02 (sem better-sqlite3 no Bun).

### Technology Stack
- `research/STACK.md` — `@langchain/langgraph` 0.4.x (a instalar — ainda não está no package.json), `@langchain/core` peer, `MemorySaver` vs `SqliteSaver` (este último usa better-sqlite3, Node-only — NÃO usar no Bun). Padrões de StateGraph cíclico, anotações de estado e checkpointing.

### Código existente (contratos a respeitar)
- `src/perception/types.ts` — Contrato `WorldSnapshot` (entrada da camada cognitiva). Mudanças aqui são breaking changes.
- `src/skills/index.ts` — `skillRegistry` (funções) e `toolRegistry` (schemas Zod) que o loop consome.
- `src/skills/executor.ts` — `executeWithSafety`, `SkillTimeoutError`, `SkillStuckError` reutilizados sem modificação.
- `src/bot/index.ts` — `onBotReady(bot)` é o ponto de injeção: na Fase 2 este callback passa a iniciar o loop do StateGraph (substituindo a demo da Fase 1).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `executeWithSafety<T>(action, opts)` (`src/skills/executor.ts`): timeout + watchdog de progresso + ritmo humanizado. O nó Execute do loop chama as skills através dele sem modificação. Já expõe `SkillTimeoutError`/`SkillStuckError` que alimentam o backoff (D-11) e a rede de segurança (D-10).
- `skillRegistry: Record<string, SkillFunction>` (`src/skills/index.ts`): mapa nome→função. O loop executa skills por nome. `follow`/`attack` são stubs (timeout imediato) — alinhados com os estados stub Fighting/Building (D-06).
- `buildWorldSnapshot(bot)` (`src/perception/snapshot.ts`): o nó Observe chama isto para obter o snapshot imutável a cada tick. `nearbyBlockTypes` alimenta a escada de Gathering (D-07); `players`/`entities` alimentam a arbitragem de estado (D-05).

### Established Patterns
- **Imutabilidade do snapshot (D-10 Fase 1):** a camada cognitiva opera só sobre `WorldSnapshot` deep-frozen, nunca sobre `bot`. O StateGraph deve manter esse contrato.
- **Stub explícito:** `follow`/`attack` mostram o padrão de stub (entram no registry, retornam imediatamente). Fighting/Building seguem o mesmo padrão.
- **Schemas Zod por skill:** já prontos para tools do LLM na Fase 3 — não precisam mudar aqui.

### Integration Points
- `src/bot/index.ts` → `onBotReady(bot)`: ponto onde o loop do StateGraph é iniciado após spawn/reconexão. Hoje só faz a demo da Fase 1; a Fase 2 substitui por `startCognitiveLoop(bot)` (ou equivalente).
- Leitura de chat: o parser de comando literal (D-09) registra um handler `bot.on('chat', ...)` que apenas mapeia palavra-chave → mudança de modo de controle. É o único acoplamento novo ao objeto `bot` além do Observe — manter isolado num módulo de controle.
- Estado do loop (modo de controle, memória CP, estado cognitivo atual) vive fora do `bot`, em estruturas próprias / no estado anotado do StateGraph — preparando (mas não implementando) o "estado fora-do-bot" da Fase 3.

</code_context>

<specifics>
## Specific Ideas

- O usuário quer o agente **autônomo por padrão**, não meramente reativo a jogadores. A interação com jogador é um *controle opcional* (pausar/chamar/liberar), não a razão de existir do loop.
- O objetivo emergente declarado pelo usuário: **"sobreviver e ficar mais forte por viver"** — orienta a escada de Gathering (D-07) e prenuncia o sistema de necessidades da Fase 3, mas na Fase 2 é só regra fixa.
- O usuário sinalizou não querer "mecânica rígida" que brigue com a liberdade futura do LLM — daí a rede de segurança COG-04 ser deliberadamente mínima (D-10) e o comprometimento rico ficar para a Fase 3.
- Comando de chat aqui é **literal/palavra-chave**, jamais conversa — essa fronteira separa Fase 2 (parser fixo) de Fase 3 (CHAT-01 conversacional).

</specifics>

<deferred>
## Deferred Ideas

- **Conversa coerente com jogadores (CHAT-01):** Fase 3. Aqui só comando literal de palavra-chave.
- **Necessidades que decaem + objetivos dinâmicos priorizados com histerese/comprometimento rico (NEED/GOAL):** Fase 3. A escada de sobrevivência da Fase 2 é o precursor de regra fixa.
- **Arquitetura de duas taxas (camada reativa + deliberação LLM single-flight) (COG-03):** Fase 3. A Fase 2 usa tick único single-flight bloqueante (D-02), que prepara o terreno.
- **Persistência do estado/memória (bun:sqlite vs JSON vs vector store) e sobrevivência a reinício/reconexão (MEM-02/03, CONN-03):** Fase 4 (e CONN-03 na Fase 3). MemorySaver em memória por ora (D-03).

</deferred>

---

*Phase: 02-loop-aut-nomo-e-mem-ria-de-curto-prazo*
*Context gathered: 2026-06-18*
