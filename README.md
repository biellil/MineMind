# MineMind

> Uma mente autônoma vivendo entre os blocos.

MineMind é um agente autônomo persistente que **vive** dentro do Minecraft. Diferente de bots tradicionais orientados por comandos, ele tem objetivos próprios, memória de longo prazo, personalidade evolutiva e toma decisões sozinho — uma entidade digital que existe continuamente no mundo, percebendo o ambiente e agindo sobre ele **sem intervenção humana**.

É um projeto de pesquisa/aprendizado sobre arquiteturas de agentes, sistemas de memória e orquestração cognitiva. A prioridade é design limpo e instrutivo, não features impressionantes.

---

## Como o bot funciona hoje

O coração do MineMind é um **loop cognitivo de duas velocidades** que roda continuamente enquanto a sessão está viva:

```
            ┌─────────────────── tick rápido (~500ms, sem LLM) ───────────────────┐
            │                                                                      │
  observe ──► analyze ──► updateMemory ──► decide ──► execute ──► (driver re-invoca)
     │                                                    │
 percepção                                          1 skill por tick
     │                                              (single-flight)
     ▼                                                    ▲
 WorldSnapshot                                            │
 (imutável)                                               │
            └───────► deliberação LLM "lenta" (paralela, não bloqueia o tick) ─────┘
                              │
                  decisão de ação + reflexão
```

A ideia central: **a percepção e a reação são rápidas e determinísticas; o raciocínio com LLM é lento e roda em paralelo, sem nunca travar o tick.** O modelo local é fraco, então só uma inferência roda por vez (single-flight) e a camada reativa sempre tem um plano determinístico de fallback.

### 1. Percepção — `WorldSnapshot`

A cada tick, [`buildWorldSnapshot`](src/perception/snapshot.ts) captura um retrato **imutável** (deep-clone + `Object.freeze`) do mundo, sem nenhuma referência ao objeto `bot`. A camada cognitiva nunca toca o bot diretamente — só esse snapshot. Ele contém:

| Campo | O que captura |
|-------|---------------|
| `status` | Vida, comida, posição, hora do dia (dia/noite) |
| `entities` | Entidades não-jogadoras no raio (tipo, posição, distância, vida), ordenadas por proximidade |
| `players` | Jogadores próximos (username, gamemode, ping, distância) |
| `nearbyBlockTypes` | Tipos de bloco no raio — **resumidos por tipo** (contagem + até 3 posições de exemplo), não bloco a bloco |
| `inventory` | Inventário slot a slot |
| `lookingAt` | Bloco na mira do bot (`blockAtCursor`) |
| `underfoot` | Bloco sob os pés |

Raio de percepção padrão: **32 blocos** (`PERCEPTION_RADIUS`).

### 2. Motivação — necessidades e objetivos

Ainda no `observe`, o bot roda um pipeline de motivação com pesos **por disposição**:

- **Necessidades** (`survival`, `resources`, `curiosity`) são reavaliadas a partir do snapshot. Há anti-starvation monotônico (a urgência cresce com o tempo ignorado).
- **Objetivos** são gerados a partir das necessidades que cruzam um limiar de urgência, e selecionados com **histerese** (não troca de objetivo à toa) e **preempção** (perigo de sobrevivência crítico fura a fila).
- A **disposição** (`AUTONOMOUS` padrão / `ASSISTANT`) modula os pesos: o modo assistente reduz curiosidade para ficar mais disponível.

### 3. Processamento — decisão reativa + deliberação LLM

O `analyze` decide o próximo estado cognitivo (`idle`, `gathering`, `exploring`, `socializing`, …) seguindo esta ordem:

1. **Prefere a decisão LLM fresca** (se houver uma deliberação recente e o modo for autônomo).
2. Senão, **degrada para o arbiter determinístico** — uma regra fixa que sempre produz uma ação razoável mesmo com o LLM offline.
3. Se houver muitas falhas seguidas, cai para `idle` (backoff).

A **deliberação LLM** ([`deliberation.ts`](src/cognition/deliberation.ts)) roda **fora do grafo**, disparada por eventos (chat, mudança de objetivo, limiar de necessidade, periódico). Ela serializa o contexto (snapshot + necessidades + objetivo + eventos recentes), pede ao LLM uma ação estruturada (validada por Zod) e grava o resultado no holder para o próximo tick consumir. Garantias: single-flight, orçamento mínimo entre replanejamentos, e o arbiter sempre como piso de fallback.

### 4. Ação — skills com `single-flight`

O `execute` dispara **no máximo uma skill por tick**, aguardada. As skills atuais:

| Skill | Estado | O que faz |
|-------|--------|-----------|
| [`dig`](src/skills/dig.ts) | `gathering` | Coleta o bloco de maior prioridade presente (madeira → pedra → minérios) |
| [`navigate`](src/skills/navigate.ts) | `exploring` / `socializing` | Navega via pathfinder A* (vagar, ou se aproximar de um jogador) |
| [`follow`](src/skills/follow.ts) | — | Stub |
| [`attack`](src/skills/attack.ts) | — | Stub |

Há guardas de segurança: **anti-repetição** (abandona uma ação repetida sem progresso), **cooldown de alvo falho** e **bounds no pathfinder** (evita OOM do A*).

### 5. Memória, reflexão e identidade

- **Memória de curto prazo**: ring buffer de eventos com orçamento de tokens.
- **Memória de longo prazo**: SQLite + `sqlite-vec` (busca semântica KNN). Só eventos acima de um piso de importância são persistidos.
- **Reflexão**: periodicamente (gatilho híbrido por importância acumulada / piso temporal) o bot consolida curto→longo prazo, pede ao LLM um resumo + atualizações de objetivo, e faz flush ao disco.
- **Personalidade & perfis sociais** evoluem e persistem.
- **Persistência da mente**: o holder (necessidades, objetivos, memória, personalidade) é hidratado do disco no boot e faz flush periódico + no shutdown, sobrevivendo a reconexões e crashes.

### 6. Chat & controle

Um único handler de chat por sessão processa, em ordem estrita:

1. **Comandos de controle literais** (`!auto`, `!livre`, `!pausar`, …) — imunes a prompt injection (lookup exato, antes do LLM).
2. **Comandos de disposição** (`!ajudante`, `!sozinho`).
3. **Conversa** — única chamada com LLM no caminho de chat; não bloqueia o tick reativo.

### 7. Provider LLM configurável

O provider abstrai **LM Studio (local, padrão, custo zero)** e **OpenAI GPT-4.1-mini (cloud, opt-in)** atrás da mesma interface (`LLM_PROVIDER=local|openai`). O caminho cloud tem **teto de gasto** persistido (hard-cap de chamadas/janela → fallback automático para o local). Os **embeddings permanecem sempre locais**, mantendo o KNN semântico custo-zero.

---

## Stack

- **Linguagem/runtime**: TypeScript + [Bun](https://bun.sh)
- **Interface com o jogo**: [Mineflayer](https://github.com/PrismarineJS/mineflayer) (+ `pathfinder`, `collectblock`) — Minecraft Java Edition
- **Orquestração cognitiva**: [`@langchain/langgraph`](https://langchain-ai.github.io/langgraphjs/) (StateGraph finito por tick, driver externo fecha o ciclo)
- **LLM**: LM Studio local (padrão) ou OpenAI via `@langchain/openai`
- **Memória**: SQLite + `sqlite-vec`
- **Validação**: Zod (structured output)

---

## Como rodar

**Pré-requisitos:**
- [Bun](https://bun.sh) instalado
- Um servidor Minecraft Java Edition local (versão compatível, ex.: 1.21.4)
- [LM Studio](https://lmstudio.ai) rodando com um modelo de chat + um de embedding (servidor em `http://localhost:1234/v1`)

```bash
bun install        # instalar dependências
bun run start      # iniciar o agente (src/bot/index.ts)
bun run dev        # modo watch (reinicia ao salvar)
bun test           # rodar a suíte de testes
bun run typecheck  # checagem de tipos (tsc --noEmit)
```

A configuração é via variáveis de ambiente (`.env` carregado automaticamente pelo Bun). As principais — host/porta/versão do servidor, raio de percepção, provider LLM, caminho do DB — estão documentadas em [`src/config.ts`](src/config.ts).

---

## Estado do projeto

| Milestone | Status |
|-----------|--------|
| **v1.0 MVP** — espinha cognitiva, loop com LLM, memória/reflexão/persistência, navegação/coleta | ✅ Entregue (2026-06-19) |
| **v2.0 Autonomia de Verdade** — sobreviver, craftar e progredir na tech tree sozinho | 🚧 Em andamento |

**v2.0** transforma o bot de "loop que fala e vaga" em "player que sobrevive e progride sozinho", em fases dependência-dirigidas: provider configurável (✅), grounding de ações verificadas pelo mundo real (🚧 atual), sobrevivência reflexa (System 1), crafting/smelting, tech tree (madeira → ferro → diamante), modos autônomo/assistente, building, combate e aprendizado por reflexão.

O roadmap completo está em [`.planning/ROADMAP.md`](.planning/ROADMAP.md).
