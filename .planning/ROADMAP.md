# Roadmap: MineMind

## Overview

MineMind nasce como uma espinha sem-LLM antes de qualquer incerteza de raciocínio: primeiro o agente conecta, permanece vivo, percebe o mundo e executa skills cruas com segurança (Fase 1); depois um loop cognitivo cíclico de regras fixas com memória de curto prazo prova a arquitetura sem o LLM (Fase 2). Só então o LLM local entra, trazendo conversa coerente, necessidades internas e objetivos dinâmicos — onde se concentram os maiores riscos (Fase 3). Por fim, com os limites da memória de curto prazo já sentidos, resolve-se a persistência de longo prazo, reflexão, perfis sociais e personalidade evolutiva (Fase 4). A ordenação é deliberadamente dirigida por dependências e por pitfalls: cada guarda precede o que ela protege.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Presença e Conexão (fundação sem-LLM)** - Agente conecta, permanece online, percebe o mundo e executa skills cruas com timeout e ritmo humanizado.
- [x] **Phase 2: Loop Autônomo e Memória de Curto Prazo** - StateGraph cíclico com nós de regra fixa, comportamento autônomo e buffer de memória limitado — ainda sem LLM. ✓ 2026-06-19
- [ ] **Phase 3: Cognição com LLM — Loop Completo, Necessidades e Objetivos** - LLM local guia análise/plano/conversa; necessidades internas decaem e geram objetivos dinâmicos com histerese.
- [ ] **Phase 4: Persistência, Reflexão e Identidade Viva** - Memória de longo prazo e semântica sobrevive a reinícios; reflexão, perfis por jogador e personalidade evolutiva.

## Phase Details

### Phase 1: Presença e Conexão (fundação sem-LLM)
**Goal**: O agente conecta a um servidor Minecraft Java local, permanece vivo de forma autônoma com reconexão automática, percebe o mundo via um snapshot imutável e executa skills físicas cruas com segurança (timeout/watchdog e ritmo humanizado). Prova os dois maiores desconhecidos externos — comportamento do Mineflayer e compatibilidade do runtime Bun — antes de qualquer camada cognitiva.
**Depends on**: Nothing (first phase)
**Requirements**: CONN-01, CONN-02, PERC-01, PERC-02, PERC-03, PERC-04, ACT-01, ACT-02, ACT-03, ACT-04, ACT-05
**Success Criteria** (what must be TRUE):
  1. O agente entra em um servidor Java local, aparece no mundo e permanece online indefinidamente sem intervenção.
  2. Ao cair/desconectar, o agente reconecta sozinho criando uma sessão de bot limpa e volta a operar.
  3. É possível ler, sob demanda, um snapshot imutável do mundo contendo status (vida, fome, posição, hora), blocos/entidades/jogadores próximos e inventário.
  4. O agente navega até uma posição-alvo e minera um bloco-alvo via skills de alto nível; toda ação tem timeout e detector de "sem progresso" que nunca trava o loop.
  5. As ações ocorrem com ritmo humanizado (sem kick por velocidade) e os skills são expostos como funções e como tools (Zod) sem expor o mineflayer cru.
**Plans**: 3 plans

Plans:
- [x] 01-01-PLAN.md — Bootstrap: package.json, tsconfig, config.ts e WorldSnapshot types
- [x] 01-02-PLAN.md — Conexão e Percepção: createBot, reconexão automática e buildWorldSnapshot
- [x] 01-03-PLAN.md — Skills e Executor: executeWithSafety, navigate, dig, follow/attack stubs com Zod

### Phase 2: Loop Autônomo e Memória de Curto Prazo
**Goal**: Um loop cognitivo cíclico real, implementado como `StateGraph` do LangGraph com aresta de retorno, roda continuamente com nós de regra fixa (sem LLM) — provando a arquitetura central com zero incerteza de raciocínio. A disciplina de execução de ações (camada centralizada, rechecagem de pré-condições) e a memória de curto prazo limitada guardam o loop desde o instante em que ele começa a agir de forma contínua.
**Depends on**: Phase 1
**Requirements**: COG-01, COG-02, COG-04, MEM-01
**Success Criteria** (what must be TRUE):
  1. O loop cíclico (Observe → Analyze → Update Memory → ... → Execute → repete) roda sozinho sem parar, alternando entre estados básicos (Idle, Exploring/Gathering) por regras fixas.
  2. O agente vagueia/coleta de forma autônoma e visível usando os skills da Fase 1, sem qualquer chamada a LLM.
  3. O loop detecta repetição de ações e ausência de progresso, evitando oscilar ou travar num mesmo comportamento.
  4. A memória de curto prazo mantém um buffer limitado (ring buffer) dos eventos/ações recentes, com esqueleto de orçamento de tokens já presente antes do LLM existir.
**Plans**: 4 plans

Plans:
- [x] 02-01-PLAN.md — Fundacao: contratos de tipos, ring buffer de memoria (MEM-01) e maquina de modo de controle por chat literal
- [x] 02-02-PLAN.md — Nucleo de decisao: arbitragem por prioridade (D-05), escada de Gathering (D-07) e anti-repeticao/backoff (COG-04)
- [x] 02-03-PLAN.md — StateGraph + driver externo single-flight + wiring em onBotReady (COG-01)
- [x] 02-04-PLAN.md — Verificacao: smoke test multi-tick headless + checkpoint humano ao vivo

### Phase 3: Cognição com LLM — Loop Completo, Necessidades e Objetivos
**Goal**: Com o loop já provado, o LLM local (LM Studio) passa a guiar análise, planejamento, reflexão e conversa coerente, sob uma arquitetura de duas taxas (camada reativa rápida + deliberação LLM sob gatilho, single-flight). O sistema de motivação intrínseca entra: necessidades internas que decaem alimentam objetivos dinâmicos priorizados, com comprometimento/histerese. Aqui se concentram os pitfalls mais perigosos do projeto.
**Depends on**: Phase 2
**Requirements**: COG-03, CHAT-01, CHAT-02, CHAT-03, LLM-01, LLM-02, LLM-03, NEED-01, NEED-02, GOAL-01, GOAL-02, CONN-03
**Success Criteria** (what must be TRUE):
  1. O agente raciocina e planeja via LLM local (LM Studio, endpoint OpenAI-compatível) atrás de um cliente abstraído por provedor; a saída é restringida (enum de ações fechado + Zod + repair/fallback) e tolera o modelo local.
  2. O loop opera em duas taxas com chamada LLM single-flight (sem sobrepor inferências nem travar a camada reativa), re-planejando sob gatilho de evento.
  3. O agente lê o chat e responde mensagens de jogadores de forma coerente, com uma personalidade base consistente.
  4. Necessidades internas (sobrevivência, recursos, abrigo, curiosidade, socialização) decaem com o tempo e influenciam estado e prioridade de objetivos, com anti-starvation; objetivos dinâmicos têm prioridade/progresso/dependências e o agente mantém comprometimento (não troca de alvo a cada tick) respeitando um orçamento de replanejamento.
  5. O estado cognitivo vive fora do objeto bot e sobrevive a uma reconexão (o agente não reinicia do zero ao reconectar).
**Plans**: 5 plans

Plans:
- [x] 03-01-PLAN.md — Fundação LLM: provider abstraído (LLM-03), saída estruturada com enum fechado + repair/fallback (LLM-02), persona estática (CHAT-03) e tokenizer real (js-tiktoken)
- [x] 03-02-PLAN.md — Motivação (módulos puros TDD): necessidades híbridas com anti-starvation (NEED-01/02) e objetivos dinâmicos com histerese/preempção (GOAL-01/02)
- [x] 03-03-PLAN.md — Integração: holder de estado durável (CONN-03), deliberação single-flight fora do grafo (COG-03), wiring needs/goals no grafo + config .env
- [x] 03-04-PLAN.md — Conversa e disposição: caminho conversacional isolado (CHAT-01/02), eixo AUTONOMOUS/ASSISTANT por chat (D-04/D-05), !auto (D-14)
- [x] 03-05-PLAN.md — Verificação: smoke headless (degradação ao arbiter + tick não-bloqueante), teste de reconexão (CONN-03) e checkpoint humano ao vivo

**UI hint**: no

### Phase 4: Persistência, Reflexão e Identidade Viva
**Goal**: Com os limites da memória de curto prazo já sentidos na prática, resolve-se com evidência a questão aberta de persistência (SQLite vs JSON vs vector store). O agente passa a lembrar entre reinícios, recuperar memórias por relevância semântica, refletir para consolidar memória e atualizar objetivos, manter perfis por jogador e fazer a personalidade evoluir a partir de uma linha de base.
**Depends on**: Phase 3
**Requirements**: MEM-02, MEM-03, REFL-01, SOC-01, SOC-02
**Success Criteria** (what must be TRUE):
  1. A memória de longo prazo (jogadores, locais, eventos) persiste e sobrevive a reinícios completos do processo.
  2. O agente recupera memórias semânticas relevantes por similaridade, combinando recência × relevância × importância.
  3. No estado Reflecting, o agente revisa acontecimentos recentes, consolida memória e atualiza seus objetivos.
  4. O agente mantém um perfil por jogador (nome, frequência de interação, histórico, grau de confiança) e sua personalidade evolui a partir de uma linha de base estática (sem aprendizado adaptativo avançado).
**Plans**: TBD

Plans:
- [ ] TBD durante /gsd:plan-phase 4

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Presença e Conexão | 3/3 | Complete | 2026-06-18 |
| 2. Loop Autônomo e Memória CP | 4/4 | Complete | 2026-06-19 |
| 3. Cognição com LLM | 0/5 | Not started | - |
| 4. Persistência e Identidade | 0/TBD | Not started | - |

## Backlog

### Phase 999.1: Otimizar pathfinding da coleta (collectBlock) para suportar raio de percepção maior sem OOM (BACKLOG)

**Goal:** Permitir `PERCEPTION_RADIUS` maior (ex: 32) sem estourar memória/OOM no estado Gathering. Hoje o A* do mineflayer-pathfinder via `bot.collectBlock.collect()` explode a memória (~78GB VM) e o processo é morto pelo OOM killer ao entrar em gathering com raio alto — bloqueando o event loop de forma síncrona (os timeouts da rede de segurança nem disparam). Workaround atual: `PERCEPTION_RADIUS=8` no `.env` (degrada percepção). Fix proper: bound o pathfinding (thinkTimeout/maxIterations no Movements), validar alcançabilidade antes de coletar, e/ou separar "raio de percepção" do "raio de busca de coleta". Origem: Fase 2, descoberto na verificação humana ao vivo do Plano 02-04. Ver `.planning/todos/pending/gathering-collectblock-oom.md`.
**Requirements:** D-01..D-07 (decisões travadas em 999.1-CONTEXT.md — fase de backlog sem REQ-IDs canônicos)
**Plans:** 4/5 plans executed

Plans:
- [x] 999.1-01-PLAN.md — Config: GATHER_SEARCH_RADIUS + PATHFINDER_SEARCH_RADIUS/THINK_TIMEOUT_MS + validação (D-01/D-02)
- [x] 999.1-02-PLAN.md — Bounds do A* em connection.ts: globais + bot.collectBlock.movements (D-03)
- [x] 999.1-03-PLAN.md — dig.ts: gatherSearchRadius + pré-check getPathTo por instância (D-01/D-04/D-05)
- [x] 999.1-04-PLAN.md — Remover double-wrap em nodes.ts; skills auto-embrulham (D-06)
- [ ] 999.1-05-PLAN.md — Verificação: smoke headless do tripé sem-OOM/rejeita/lag<200ms (D-07)
