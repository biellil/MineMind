# Phase 1: Presença e Conexão (fundação sem-LLM) - Context

**Gathered:** 2026-06-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Implementar a espinha dorsal do agente sem nenhum LLM: conectar a um servidor Minecraft Java local, manter-se vivo com reconexão automática, capturar o estado do mundo em um snapshot imutável e executar skills físicas com segurança (timeout/watchdog + ritmo humanizado). Prova os dois maiores desconhecidos externos — compatibilidade Bun↔Mineflayer e comportamento do Mineflayer — antes de qualquer camada cognitiva.

Requisitos cobertos: CONN-01, CONN-02, PERC-01, PERC-02, PERC-03, PERC-04, ACT-01, ACT-02, ACT-03, ACT-04, ACT-05.

Fora do escopo desta fase: qualquer chamada a LLM, LangGraph StateGraph, memória, loop cognitivo, chat com jogadores.

</domain>

<decisions>
## Implementation Decisions

### Runtime e Stack

- **D-01:** Usar **Bun** como runtime desde o primeiro commit. Se um addon NAPI quebrar, registrar e cair para Node — mas começar com Bun para validar o desconhecido (bloqueio registrado em STATE.md). Bun gerencia pacotes, executa TypeScript nativamente e é o runtime de todo o projeto.
- **D-02:** Consequência direta do Bun: **não usar `better-sqlite3`** (ABI mismatch). Persistência futura (Fase 2+) usará `bun:sqlite`. Não instalar `prismarine-viewer` (requer node-canvas-webgl NAPI addon).

### Servidor Minecraft local

- **D-03:** Versão do servidor: **Minecraft Java 1.21.x** (latest stable suportada pelo mineflayer 4.37.1).
- **D-04:** Tipo de servidor: **Vanilla oficial** (não Paper/Spigot).
- **D-05:** Modo de autenticação: **offline-mode** (sem auth Mojang para desenvolvimento local).
- **D-06:** Configuração de conexão (host, porta, username, versão MC) via **arquivo `.env`**. O repositório inclui `.env.example` com valores padrão para desenvolvimento.

### Snapshot de Percepção (PERC-04)

- **D-07:** **Raio de blocos configurável** via `.env` (padrão: 32 blocos). O snapshot inclui os tipos de bloco dentro do raio mas não serializa todos os blocos individualmente — apenas os tipos relevantes (mineráveis, sólidos, água, lava) com contagem e exemplos de posição.
- **D-08:** **Entidades completas**: para cada entidade no raio, incluir tipo, posição, distância, vida (se disponível no Mineflayer) e metadata relevante (hostil/passiva, nome para jogadores).
- **D-09:** **Inventário completo slot a slot**: cada slot com item ID, quantidade, metadata/enchantments e slot de equipamento (armadura, mainhand, offhand).
- **D-10:** O snapshot é um **objeto imutável** (Object.freeze ou cópia profunda) criado sob demanda. A camada cognitiva nunca recebe referência ao objeto `bot` diretamente.

### Skills e Zod Tools (ACT-05)

- **D-11:** Implementar schemas Zod **agora na Fase 1**, mesmo sem LLM. Cada skill tem: (a) função TypeScript com parâmetros tipados e (b) schema Zod que documenta e valida os parâmetros em tempo de execução. Na Fase 3, o LangGraph recebe os schemas sem refatoração.
- **D-12:** **Skills a implementar na Fase 1:**
  - `navigate(target: {x, y, z} | BlockType)` — pathfinder até posição ou bloco-alvo (ACT-01)
  - `dig(target: BlockPosition | BlockType)` — minerar bloco-alvo (ACT-02)
  - `follow(entityName: string)` — **stub** (timeout imediato, sem lógica real)
  - `attack(entityName: string)` — **stub** (timeout imediato, sem lógica real)
- **D-13:** Toda ação física passa por um **executor centralizado** que: (a) aplica timeout configurável, (b) detecta ausência de progresso via polling periódico, (c) aplica ritmo humanizado (delay aleatório com distribuição gaussiana entre ações). Skills não acessam o objeto `bot` diretamente — passam pelo executor.

### Claude's Discretion

- Valor exato do timeout padrão por skill (sugestão: 30s navigate, 10s dig).
- Parâmetros da distribuição gaussiana para ritmo humanizado (média/desvio padrão dos delays).
- Estrutura de diretórios do projeto (src/skills/, src/perception/, etc.).
- Estratégia de logging de reconexão (console vs arquivo).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Specs
- `.planning/ROADMAP.md` — Phase 1 goal, success criteria, and requirement mapping
- `.planning/REQUIREMENTS.md` — Definições completas de CONN-01/02, PERC-01–04, ACT-01–05
- `.planning/PROJECT.md` — Constraints (Bun runtime, TypeScript all-in, LM Studio v1, servidor local)

### Technology Stack
- `research/STACK.md` — Versões exatas de todos os pacotes (mineflayer 4.37.1, mineflayer-pathfinder 2.4.5, @langchain/langgraph 0.4.x, zod 4.4.3), compatibilidade Bun vs Node, padrões recomendados e o que evitar.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Nenhum — projeto sem código ainda. Esta fase cria a estrutura inicial do repositório.

### Established Patterns
- Nenhum estabelecido ainda — esta fase define os padrões base que as fases seguintes vão seguir.

### Integration Points
- A camada de percepção (`WorldSnapshot`) é o contrato de interface entre o Mineflayer (Fase 1) e o LangGraph StateGraph (Fase 2+). Mudanças no tipo `WorldSnapshot` afetam todas as fases subsequentes.
- O executor centralizado de skills é o ponto de injeção para humanização, timeout e watchdog — o mesmo executor será reutilizado sem modificação nas Fases 2 e 3.
- Os schemas Zod de skills (Fase 1) são consumidos diretamente pela definição de tools do LangGraph (Fase 3) via `zodToJsonSchema` ou equivalente.

</code_context>

<specifics>
## Specific Ideas

- Servidor Vanilla oficial (não Paper) foi escolhido explicitamente pelo usuário — não substituir por Paper/Spigot mesmo que a documentação sugira.
- Bun como runtime é uma decisão de validação deliberada: o projeto quer provar a compatibilidade desde o início, não deixar como dívida técnica.
- Entidades e inventário em formato completo (não resumido) — o usuário prefere dados ricos no snapshot para não precisar ampliar a interface depois.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 01-presen-a-e-conex-o-funda-o-sem-llm*
*Context gathered: 2026-06-18*
