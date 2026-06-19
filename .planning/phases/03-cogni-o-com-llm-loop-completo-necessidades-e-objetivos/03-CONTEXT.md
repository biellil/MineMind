# Phase 3: Cognição com LLM — Loop Completo, Necessidades e Objetivos - Context

**Gathered:** 2026-06-19
**Status:** Ready for planning

<domain>
## Phase Boundary

O LLM local (LM Studio, endpoint OpenAI-compatível) passa a guiar **análise, planejamento, reflexão e conversa coerente**, sob uma **arquitetura de duas taxas** (camada reativa rápida da Fase 2 + deliberação LLM sob gatilho, **single-flight**). Entra o sistema de **motivação intrínseca**: necessidades internas que decaem alimentam **objetivos dinâmicos** priorizados, com comprometimento/histerese. O **estado cognitivo passa a viver fora do objeto `bot` e sobrevive a uma reconexão** (CONN-03, em processo). É introduzido um **eixo de disposição/persona (AUTONOMOUS vs ASSISTANT)** configurável que dá ao projeto sua natureza de prova de conceito.

Requisitos cobertos: COG-03, CHAT-01, CHAT-02, CHAT-03, LLM-01, LLM-02, LLM-03, NEED-01, NEED-02, GOAL-01, GOAL-02, CONN-03.

**Fora do escopo desta fase (adiado deliberadamente):**
- Persistência em disco / sobrevivência a reinício completo do processo, memória de longo prazo e recuperação semântica (Fase 4 — MEM-02/03). CONN-03 aqui é **em processo** (sobrevive à reconexão do bot, não ao restart do processo).
- Reflexão consolidando memória de longo prazo, perfis por jogador e personalidade evolutiva (Fase 4 — REFL-01, SOC-01/02). A "reflexão" desta fase é o nó do loop que ajusta objetivos com base na memória de curto prazo, não a consolidação durável.
- Provedores de LLM em nuvem (v2 — PROV-01). Apenas a abstração de provedor (LLM-03) é criada agora, com LM Studio como única implementação.
- Personalidade adaptativa/aprendizado contínuo (v2 — ADV-01). A personalidade aqui é um prompt base estático (CHAT-03).

</domain>

<decisions>
## Implementation Decisions

### Personalidade & Voz (CHAT-03)

- **D-01:** **Arquétipo: "sobrevivente pragmático".** Focado em tarefas, reservado, fala pouco e direto. A personalidade aparece pela concisão, não pela tagarelice. É um prompt base **estático** (sem evolução — isso é Fase 4).
- **D-02:** **Idioma: espelha quem fala.** O agente responde no idioma da mensagem recebida (na prática, pt-BR com os jogadores brasileiros). Exige que o prompt instrua o LLM local a detectar/casar o idioma do interlocutor.
- **D-03:** **Auto-percepção: critério do Claude.** Não é decisão de visão travada — o personality prompt define o tom (assumir-se IA vs roleplay de habitante) sem regra rígida. Default sugerido: honesto sobre ser um agente, alinhado ao foco de pesquisa, mas sem ênfase.

### Eixo de Disposição / Persona — AUTONOMOUS vs ASSISTANT (decisão central de visão)

- **D-04:** O projeto é uma **prova de conceito com dois propósitos**, expostos como um **eixo de disposição/persona ortogonal** aos modos de controle da Fase 2:
  - **AUTONOMOUS** — o agente vive e tenta **sobreviver sozinho**; o operador observa a PoC (como age, quanto "aguenta" no jogo).
  - **ASSISTANT** — o agente age como **um companheiro/pessoa dentro do jogo que ajuda** os jogadores.
  Este eixo é **separado e ortogonal** aos modos de controle em runtime da Fase 2 (`!pausar`/`!vem`/`!livre`/`!auto` = freio de segurança ao vivo). Disposição = *propósito*; controle = *freio*.
- **D-05:** **Seleção do modo: `.env` define o default + troca em runtime por comando literal de chat** (ex.: `!ajudante` → ASSISTANT, `!sozinho` → AUTONOMOUS — palavras-chave exatas a critério do Claude, seguindo o padrão literal/sem-LLM de D-09 da Fase 2). Permite isolar cada modo (via `.env`) ou demonstrar ambos numa sessão só (via chat).
- **D-06:** **O que muda entre os modos:** personalidade/tom, **proatividade**, **peso das necessidades** e a **aceitação de tarefas de jogadores** (ver D-13). A camada física (skills, safety, snapshot) é a mesma nos dois modos.
- **D-07:** **No modo AUTONOMOUS, o agente praticamente ignora jogadores** — só reage a comandos de controle (`!pausar` etc.), mantendo a observação de sobrevivência o mais "pura" possível. Conversa coerente fica essencialmente desligada/mínima nesse modo.

### Necessidades Internas & Motivação (NEED-01/02)

- **D-08:** **Conjunto enxuto de 3 necessidades ativas:** **sobrevivência, recursos, curiosidade.** **Abrigo e socialização entram como stub** (no enum/estrutura, sem lógica de decaimento real — espelha o padrão de stub de Fighting/Building da Fase 2). Reduz a superfície para provar o mecanismo decai→objetivo com modelo local fraco.
- **D-09:** **Origem dos valores: híbrido (estado real + timer).** Sobrevivência e recursos derivam do **estado real do jogo** lido do `WorldSnapshot` (vida, fome, inventário); curiosidade decai por **timer temporal**. Mais ancorado na realidade e reativo ao mundo do que timers puros.
- **D-10:** **Pesos equilibrados** entre as 3 necessidades ativas por padrão (não "sobrevivência domina"), ajustáveis por config. O eixo de disposição (D-06) pode modular esses pesos. Comportamento mais variado/"vivo".
- **D-11:** **Anti-starvation (NEED-02):** necessidade ignorada cresce em prioridade ao longo do tempo, garantindo que nenhuma necessidade fique permanentemente preterida. Parâmetros (taxa de decaimento, limiares) configuráveis. Esta extensão **substitui/estende** a escada de Gathering fixa da Fase 2 (D-07 Fase 2), que era o precursor de regra fixa.

### Conversa com Jogadores (CHAT-01/02)

- **D-12:** **Gatilho de resposta: considera todo chat de jogador próximo** (não só quando endereçado). Como o arquétipo é reservado (D-01), as respostas tendem a ser curtas. **Proatividade configurável via `.env`** (reativo apenas vs sob gatilho — ex.: cumprimentar jogador que chega). No modo AUTONOMOUS a conversa é mínima (D-07).
- **D-13:** **No modo ASSISTANT, pedido de jogador em linguagem natural vira objetivo dinâmico** (ex.: "me ajuda a coletar madeira", "vem comigo") — interpretado pelo LLM e convertido em um objetivo (GOAL-01). **Esta é a maior superfície de falha do modelo local** → a validação/restrição de saída e o fallback (LLM-02, D-17) são críticos aqui. No modo AUTONOMOUS, pedidos de jogador **não** viram objetivos.
- **D-14:** **`!auto` é adicionado ao mapa de comandos literais de controle** (`COMMANDS` em `src/control/commands.ts`) como **alias de modo autônomo de controle**, mantendo o `!livre` existente (menos quebra do que já foi validado ao vivo na Fase 2). Permanece parsing literal exato, **sem LLM**. *Nota:* não confundir com o eixo de disposição (D-05) — `!auto`/`!livre` é o modo de **controle** (freio), `!sozinho`/`!ajudante` é a **disposição** (propósito).

### Objetivos Dinâmicos & Comprometimento (GOAL-01/02)

- **D-15:** **Comprometimento forte com histerese**, mas com **preempção bem definida**: o agente segura um objetivo por bastante tempo (não troca a cada tick), e só **furam o comprometimento**: (a) **sobrevivência crítica** (vida/fome baixas — anti-starvation) e (b) no modo ASSISTANT, **pedido/chegada de jogador**. Força da histerese e limiares configuráveis. A preempção por perigo casa com o anti-starvation (D-11); a preempção por jogador casa com D-13.
- **D-16:** Objetivos dinâmicos têm **prioridade, progresso e dependências** (GOAL-01). As fontes de objetivo são: (1) necessidades internas que cruzam limiar (D-11) e (2) pedidos de jogador no modo ASSISTANT (D-13).

### Arquitetura de Duas Taxas & Restrição de Saída (COG-03, LLM-01/02/03)

- **D-17:** **Fallback gracioso para a espinha de regra fixa da Fase 2.** Quando a saída do LLM for inválida/irreparável ou o LLM estiver indisponível, o agente **degrada para o comportamento determinístico da Fase 2** (arbiter por prioridade + safety), nunca trava nem age de forma insegura. Materializa "cada guarda precede o que ela protege": a camada sem-LLM é a rede sob o LLM. Saída restrita = **enum de ações fechado + schema Zod + repair/retry + fallback** (LLM-02).
- **D-18:** **Cliente LLM abstraído por provedor (LLM-03):** uma interface de provedor com LM Studio (`@langchain/openai` apontado para o endpoint OpenAI-compatível) como única implementação nesta fase. Permite trocar para nuvem depois sem reescrever a cognição. Reutiliza o `toolRegistry` (schemas Zod já prontos da Fase 1/2) para tool-calling.
- **D-19 (Claude's Discretion):** Política exata de **gatilho da taxa lenta** (quando o LLM "para pra pensar": evento de chat / objetivo concluído-falho / necessidade cruza limiar + teto de frequência **vs** periódico) e o **orçamento de replanejamento** (intervalo mínimo entre chamadas LLM além do single-flight). Recomendação registrada: **event-driven + intervalo mínimo configurável no `.env`**, mantendo o single-flight de D-02 da Fase 2 (nunca sobrepor inferências; a camada reativa segue agindo entre deliberações).

### Estado Sobrevive à Reconexão (CONN-03)

- **D-20:** **O estado cognitivo durável (necessidades, objetivos, memória de curto prazo, modo de controle, disposição) sai do closure por-sessão de `startCognitiveLoop` e passa a viver num holder que sobrevive ao ciclo `bot.once('end')` → nova sessão.** Hoje (Fase 2) `control`/`safety`/memória são recriados a cada sessão (D-03 Fase 2 — estado do zero). A Fase 3 move esse estado para fora, de modo que a reconexão **não reinicie a mente do agente**. **Escopo: em processo apenas** — persistência em disco (sobreviver a restart) é deliberadamente Fase 4. NÃO antecipar `bun:sqlite`/JSON aqui.

### Claude's Discretion

- **D-03** Auto-percepção do agente (assume IA vs roleplay) — definida pelo personality prompt, sem regra rígida.
- **D-19** Gatilho da taxa lenta e orçamento de replanejamento (recomendação: event-driven + intervalo mínimo no `.env`).
- Palavras-chave exatas dos comandos de disposição (`!ajudante`/`!sozinho` ou similares) e o alias `!auto`.
- Foco do modo ASSISTANT quando há jogadores (ajudar e largar a sobrevivência vs ajudar sem abandonar necessidades críticas) — recomendação: respeitar anti-starvation (sobrevivência crítica sempre interrompe, ver D-15).
- Valores default de decaimento/limiares das necessidades, teto de replanejamento, tamanhos de prompt, e o tokenizer real que substitui a heurística de D-13 da Fase 2.
- Escolha do modelo local e a técnica de structured-output/tool-calling (grammar/GBNF vs JSON-mode vs prompt+Zod-repair) — **encaminhar para `/gsd:research-phase`** (já sinalizado no STATE).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Specs
- `.planning/ROADMAP.md` — Fase 3: goal, 5 critérios de sucesso e mapeamento de requisitos (COG-03, CHAT-01/02/03, LLM-01/02/03, NEED-01/02, GOAL-01/02, CONN-03). Filosofia "cada guarda precede o que ela protege".
- `.planning/REQUIREMENTS.md` — Definições completas dos requisitos desta fase, incluindo a fronteira com Fase 4 (MEM-02/03, REFL-01, SOC-01/02) que NÃO entra aqui.
- `.planning/PROJECT.md` — Constraints (Bun runtime, all-TypeScript, LangGraph, LM Studio local v1, abstração de provedor, servidor local). Core value: o loop cognitivo (perceber → decidir → agir) precisa funcionar.
- `.planning/STATE.md` — Sinalização para research: grammar/structured-output e tool-calling do modelo local; estado cognitivo durável fora-do-bot.

### Prior Phase Context (decisões que esta fase carrega/estende)
- `.planning/phases/02-loop-aut-nomo-e-mem-ria-de-curto-prazo/02-CONTEXT.md` — D-02 (tick único single-flight bloqueante → base das duas taxas), D-03 (MemorySaver; estado do zero por sessão → CONN-03 muda isso), D-07 (escada de Gathering fixa → precursor das necessidades), D-08/D-09 (modos de controle + parser literal de chat → `!auto` estende; disposição é eixo novo ortogonal), D-12/D-13 (ring buffer rico + esqueleto de orçamento de tokens → LLM pluga tokenizer real e consome como contexto).
- `.planning/phases/01-presen-a-e-conex-o-funda-o-sem-llm/01-CONTEXT.md` — D-10 (snapshot imutável; cognição nunca toca o bot), executor centralizado, skills como registry + schemas Zod, sem better-sqlite3 no Bun.

### Technology Stack
- `CLAUDE.md` (seção Technology Stack) / `research/STACK.md` — `@langchain/openai` apontado para LM Studio via `configuration.baseURL` (endpoint OpenAI-compat `/v1`); `zod` 4.4.3 para structured output; `js-tiktoken` para o tokenizer real da memória; caveat do `OpenAIEmbeddings` baseURL (embeddings só na Fase 4). Não usar SqliteSaver/better-sqlite3 no Bun.

### Código existente (contratos a respeitar / pontos de integração)
- `src/cognition/loop.ts` — `startCognitiveLoop(bot)`: hoje cria `control`/`safety`/grafo por sessão. CONN-03 (D-20) move o estado durável para fora deste closure.
- `src/cognition/graph.ts` — StateGraph finito-por-tick + `LoopAnnotation` (snapshot/cogState/memory). A deliberação LLM e novos campos de estado (needs/goals/mode) entram aqui.
- `src/cognition/nodes.ts` — nós Observe/Analyze/UpdateMemory/Decide/Execute. Analyze/Decide hoje são regra fixa (arbiter); a Fase 3 introduz a deliberação LLM sob gatilho (D-17/D-19) com fallback para o arbiter.
- `src/cognition/arbiter.ts` — arbitragem por prioridade fixa: vira o **fallback** (D-17) quando o LLM falha.
- `src/cognition/safety.ts` — anti-repetição/backoff: rede de segurança mantida sob o LLM.
- `src/control/commands.ts` — `COMMANDS`/`parseCommand`/`registerChatCommands`/`ControlState`: `!auto` entra no mapa (D-14); comandos de disposição (`!ajudante`/`!sozinho`, D-05) seguem o mesmo padrão literal. Conversa coerente (CHAT) é um caminho NOVO e separado do parser literal.
- `src/memory/shortTerm.ts` — `estimateTokens` (heurística ~4 chars/token) a ser substituído pelo tokenizer real; `MemEvent` (em `src/cognition/types.ts`) é o contexto que o LLM consome.
- `src/skills/index.ts` — `toolRegistry` (schemas Zod) consumido pela camada LLM para tool-calling, sem refatoração (D-11 Fase 1).
- `src/config.ts` — novos parâmetros (.env): disposição default, proatividade, pesos/decaimento de necessidades, histerese/preempção, gatilho/orçamento de replanejamento LLM, endpoint/modelo LM Studio.
- `src/perception/types.ts` — `WorldSnapshot` (vida/fome/inventário) alimenta as necessidades híbridas (D-09).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Espinha sem-LLM completa da Fase 2** (`arbiter.ts`, `safety.ts`, `graph.ts`, `nodes.ts`): vira a camada reativa rápida + o fallback gracioso (D-17). A Fase 3 adiciona deliberação por cima, não substitui.
- **`toolRegistry` com schemas Zod** (`src/skills/index.ts`): pronto para tool-calling do LLM (D-18) — schemas já têm `.toJSONSchema()`.
- **Ring buffer rico + orçamento de tokens** (`src/memory/shortTerm.ts`): contrato pensado para virar contexto do LLM; trocar `estimateTokens` por tokenizer real.
- **Parser de comando literal** (`src/control/commands.ts`): padrão imutável/seguro reutilizado para `!auto` (D-14) e comandos de disposição (D-05).
- **`WorldSnapshot` imutável** com status (vida/fome/posição/hora), blocos/entidades/jogadores e inventário: fonte das necessidades híbridas (D-09) e do gatilho de socialização.

### Established Patterns
- **Imutabilidade do snapshot / cognição nunca toca o `bot`** (D-10 Fase 1): manter na camada LLM.
- **Single-flight bloqueante** (D-02 Fase 2): a deliberação LLM respeita isso — nunca sobrepõe inferências.
- **Stub explícito** (Fighting/Building; follow/attack): mesmo padrão para abrigo/socialização como necessidades stub (D-08).
- **Estado anotado do StateGraph + `MemorySaver`/thread_id**: o estado entre ticks já persiste em memória; CONN-03 (D-20) eleva isso para sobreviver à troca de sessão.

### Integration Points
- `src/bot/index.ts` → `onBotReady(bot)` → `startCognitiveLoop(bot)`: ponto onde o estado durável (D-20) deve ser injetado de fora (criado uma vez, reutilizado a cada reconexão) em vez de recriado por sessão.
- Nós `analyze`/`decide` de `nodes.ts`: onde a deliberação LLM se conecta, com o arbiter como fallback (D-17).
- `registerChatCommands`: o handler `bot.on('chat')` ganha um caminho conversacional (CHAT) ao lado do parsing literal — mantendo os dois isolados.
- `config.ts`: superfície de configuração dos novos knobs (.env) — disposição, proatividade, necessidades, histerese, LLM.

</code_context>

<specifics>
## Specific Ideas

- **Visão central declarada pelo usuário:** o MineMind é uma **prova de conceito de dois propósitos** — (A) observar a **sobrevivência autônoma** do agente no jogo e (B) um **companheiro/assistente que age como uma pessoa para ajudar** os jogadores. Os dois modos são configuráveis (`.env` + chat). Esta dualidade orienta personalidade, proatividade, necessidades e objetivos.
- No modo ASSISTANT, o usuário quer que o agente **aceite pedidos em linguagem natural como objetivos** ("me ajuda a coletar madeira") — é o que torna o "ajudante" real.
- No modo AUTONOMOUS, o usuário quer a observação de sobrevivência o **mais pura possível** (o agente praticamente ignora jogadores).
- O usuário quer **configurabilidade ampla via `.env`** (proatividade, modo default, e por extensão os parâmetros de necessidades/objetivos/LLM) — coerente com a natureza de prova de conceito/experimentação.
- Reforço da Fase 2: o usuário **não quer mecânica rígida que brigue com a liberdade do LLM** — por isso o comprometimento forte (D-15) vem acompanhado de preempção clara, e o fallback (D-17) é o piso, não uma camisa de força.

</specifics>

<deferred>
## Deferred Ideas

- **Persistência em disco / sobrevivência a restart do processo, memória de longo prazo e recuperação semântica** (MEM-02/03): Fase 4. CONN-03 aqui é só em-processo (D-20).
- **Reflexão consolidando memória durável, perfis por jogador, personalidade evolutiva** (REFL-01, SOC-01/02): Fase 4. A personalidade desta fase é prompt estático (D-01).
- **Provedores de LLM em nuvem** (PROV-01): v2. Só a abstração de provedor é criada agora (D-18).
- **Otimização do pathfinding da coleta (collectBlock OOM)**: backlog 999.1 — todo `gathering-collectblock-oom` revisado, fora do escopo desta fase (é otimização de skill física, não cognição). Workaround atual `PERCEPTION_RADIUS=8` permanece.
- **Necessidades abrigo e socialização com lógica real**: stub nesta fase (D-08); podem ganhar lógica numa iteração futura.

</deferred>

---

*Phase: 03-cogni-o-com-llm-loop-completo-necessidades-e-objetivos*
*Context gathered: 2026-06-19*
