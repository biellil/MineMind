# Phase 4: Persistência, Reflexão e Identidade Viva - Research

**Researched:** 2026-06-19
**Domain:** Persistência embedded (bun:sqlite + sqlite-vec), memória semântica (Generative Agents retrieval), reflexão amortizada, perfis sociais e personalidade estruturada
**Confidence:** HIGH (persistência/schema/scoring), MEDIUM (caminho de embeddings via LangChain.js → recomendado contornar via fetch direto)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions (D-01 → D-17)

- **D-01:** `bun:sqlite` + `sqlite-vec` como **store único transacional** (relacional + vetorial `vec0`). Carrega via `import * as sqliteVec from 'sqlite-vec'; sqliteVec.load(db)`. Plataforma-alvo **Windows** (caveat macOS `setCustomSQLite` NÃO se aplica). Escrever o schema/SQL à mão (SqliteSaver fora — depende de better-sqlite3). Fallback documentado: `bun:sqlite` (relacional) + `vectra` (vetorial JS puro) ao custo de perder atomicidade cruzada.
- **D-02:** Política de gravação **write-through transacional** nas mutações de memória/perfil + **flush garantido no shutdown gracioso e no fim de cada ciclo de reflexão**. `PRAGMA journal_mode=WAL`. Evitar snapshot puramente periódico.
- **D-03:** Arquivo ausente → inicializa schema do zero (cold start). Corrompido → recuperação graceful (recupera o legível, loga a perda, **nunca aborta**).
- **D-04:** Restart: **TUDO persiste**, incluindo estado vivo de motivação (`needs`, `goals` comprometidos, `currentGoal`) + memória de longo prazo + perfis + personalidade. O **`CognitiveStateHolder` inteiro torna-se durável em disco** (estende D-20 da Fase 3 de em-processo para disco). Mitigação de estado estálido: D-19 (decaimento por timestamp no boot).
- **D-05:** Taxonomia híbrida: `events` append-only (embeddado) + `players`/`places` (estado mutável, upsert). Espelha o `MemEvent` tipado. Evita tabela única polimórfica e knowledge graph.
- **D-06:** Importância **100% heurística determinística** no MVP. Regras por tipo de evento. LLM fora do caminho quente de escrita. Refino por LLM = evolução futura.
- **D-07:** Scoring de recuperação = **soma ponderada normalizada α=1** (Generative Agents, Park et al. 2023): min-max [0,1] dos três fatores + pesos iguais. Recência = decaimento exponencial; importância = nota heurística; relevância = similaridade de embedding.
- **D-08:** Recuperação **gatilhada por contexto** (encontrar jogador → perfil + eventos dele; chegar a landmark → memórias do lugar) + estado Reflecting como piso garantido. **NÃO** recuperar a cada deliberação LLM.
- **D-09:** Embeddings via LM Studio (`/v1/embeddings`, `OpenAIEmbeddings` apontado ao endpoint). Atenção ao **caveat de `baseURL`** — setar via constructor e verificar, ou `OPENAI_BASE_URL`. Modelo específico → research (D-19).
- **D-10:** Gatilho de reflexão **híbrido**: primário event-driven (entrada em `idle` + objetivo concluído/falho); secundário acúmulo de importância (limiar, estilo Stanford); piso temporal anti-starvation.
- **D-11:** `reflecting` ADICIONADO ao enum `CognitiveState`. Entra no `PRIORITY_ORDER` com **prioridade baixa** (próximo de `idle`), **sempre preemptível** por sobrevivência crítica / pedido de jogador.
- **D-12:** Reflexão **NÃO é nó novo no StateGraph** — é a **mesma deliberação LLM single-flight fora do grafo** (Fase 3 D-19). O gatilho enfileira a intenção "refletir"; lock single-flight; fallback gracioso (arbiter).
- **D-13:** Produto faseado. **Sempre**: consolidação CP→LP. **Em seguida**: atualizar/reordenar objetivos (saída Zod + fallback no-op). **Adiar**: alimentar evolução de personalidade até consolidação + objetivos estáveis.
- **D-14:** Personalidade evolutiva = **estado estruturado mutável** (humor, energia social) atualizado por **contadores determinísticos** e reinjetado no prompt sobre a baseline imutável. Fronteira vs ADV-01 é **estrutural** (nenhum parâmetro treinado, nenhuma regra aprendida). LLM nunca grava o estado.
- **D-15:** `trust` por jogador = **escalar determinístico** atualizado por eventos verificáveis do Mineflayer (+ajudou/deu item, −atacou/roubou, frequência). LLM **interpreta** o número, não o calcula.
- **D-16:** Perfil por jogador (SOC-01) = dados estruturados persistidos na tabela `players`: nome, frequência de interação, histórico, `trust`.
- **D-17:** Influência no comportamento = **gate determinístico + cor de prompt** (não lógica difusa). Ex.: pedido-vira-objetivo só acima de limiar de `trust`; saudar conhecidos; cautela com `trust` negativo.

### Claude's Discretion (D-18, D-19) — RESEARCH PRIORITIES

- **D-18:** Ativação da necessidade `social` (stub) — ativar de forma mínima se a personalidade estruturada der substrato; caso contrário manter stub.
- **D-19:** Encaminhado a research (RESPONDIDO ABAIXO):
  - Mitigação de estado estálido no boot (decaimento por timestamp).
  - Modelo de embedding específico no LM Studio + técnica de geração.
  - Schema SQL exato, migrations, PRAGMAs, tabelas `events`/`players`/`places` + índice `vec0`.
  - Limiares/constantes: pesos de importância por tipo de evento, limiar de acúmulo de reflexão, teto anti-starvation, limiar de `trust`, campos do estado de personalidade, taxa de decaimento de recência, parâmetros da normalização.

### Deferred Ideas (OUT OF SCOPE)

- Refino de importância por LLM em lote (D-06) — MVP é heurística pura.
- Pesos de scoring ajustáveis + pré-filtro por metadados (D-07) — após baseline α=1.
- Recuperação em camadas e em toda deliberação (D-08).
- Verbalização do estado de personalidade por LLM / Opção C (D-14).
- Knowledge graph de relações sociais (D-05).
- ADV-01/02/03 (personalidade adaptativa, skills Voyager, síntese de crenças), PROV-01 (LLM nuvem) — v2.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MEM-02 | Persiste memória de longo prazo (jogadores, locais, eventos) que sobrevive a reinícios | Schema SQL `events`/`players`/`places` + PRAGMAs WAL + recuperação graceful (§Standard Stack, §Architecture Patterns Pattern 2/3); serialização durável do holder inteiro (§Pattern 7) |
| MEM-03 | Recupera memórias semânticas por similaridade (recência × relevância × importância) | `vec0` virtual table + KNN MATCH; fórmula Generative Agents com constantes codáveis (§Pattern 4) |
| REFL-01 | No Reflecting: revisa, consolida memória, atualiza objetivos | Gatilho híbrido com constantes (§Pattern 5); encaixe single-flight sem nó novo no grafo; produto faseado via Zod (§Pattern 5) |
| SOC-01 | Perfil por jogador (nome, frequência, histórico, confiança) | Tabela `players` mutável + upsert; eventos de trust via Mineflayer (§Pattern 6) |
| SOC-02 | Personalidade evolui a partir de baseline estática (sem ML) | Estado estruturado + contadores determinísticos reinjetados no prompt (§Pattern 6) |
</phase_requirements>

## Summary

A Fase 4 troca a "mente em-processo" da Fase 3 por uma **mente durável em disco**, usando um único arquivo SQLite. A decisão D-01 é sólida e verificada: `sqlite-vec@0.1.9` **distribui um binário nativo para Windows** (`sqlite-vec-windows-x64@0.1.9` é optionalDependency) e carrega em `bun:sqlite` com `import * as sqliteVec from 'sqlite-vec'; sqliteVec.load(db)` — sem `setCustomSQLite` (esse caveat é exclusivo de macOS). Um único `vec0` virtual table guarda os embeddings e suporta **colunas de metadados filtráveis no WHERE do KNN** (`=`, `!=`, `<`, `>`, `BETWEEN`, `IN`) e **colunas auxiliares `+`** (não-indexadas, recuperáveis no SELECT) — exatamente o que MEM-03 e a recuperação gatilhada (D-08) pedem.

O scoring de recuperação (MEM-03/D-07) é uma implementação literal e codável do *memory stream* de Park et al. 2023: **recência = decaimento exponencial** (fator 0.995 por hora no paper original — proponho adaptar para tempo real com meia-vida configurável), **importância 1–10** mapeada por tipo de `MemEvent` (heurística pura, D-06), **relevância = similaridade de cosseno** (o `vec0` com `distance_metric=cosine` retorna `distance = 1 − cos`, então `relevance = 1 − distance`). Os três são **min-max normalizados para [0,1]** sobre o conjunto candidato e somados com pesos iguais (α=1).

O ponto de **maior risco/menor confiança** é o caminho de embeddings via `OpenAIEmbeddings` do LangChain.js com `baseURL` apontado ao LM Studio: há issues abertas (langchainjs#3086, lmstudio-js#18) de o cliente travar/falhar silenciosamente. Como o projeto **já tem** um caminho `fetch` direto funcionando em `provider.ts` (o probe `/models`), a recomendação prescritiva é **chamar `/v1/embeddings` via `fetch` direto** dentro do `LlmProvider` (adicionar um método `embed(text)`), evitando a dependência frágil e mantendo o encapsulamento LLM-03. Isso também elimina a `OpenAIEmbeddings` da árvore de dependências.

**Primary recommendation:** Criar `src/memory/longTerm.ts` (store SQLite: schema + vec0 + retrieval scoring) + `src/memory/persistence.ts` (serialize/hydrate do holder). Adicionar `embed()` ao `LlmProvider` via fetch direto a `/v1/embeddings`. Adicionar `reflecting` ao enum + `PRIORITY_ORDER` (penúltimo, antes de `idle`). Reusar a deliberação single-flight existente para reflexão (D-12), com um novo schema Zod de saída. Personalidade/trust como estado estruturado determinístico reinjetado em `buildPersonaPrompt`. Boot em `bot/index.ts`: hidratar holder do disco UMA vez, aplicar decaimento por timestamp.

## Standard Stack

### Core (já instalado — verificado em package.json)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `bun:sqlite` | Bun 1.3.x built-in | Store relacional + host do vec0 | Built-in no Bun, 3–6× mais rápido que better-sqlite3 (que NÃO roda em Bun). ACID. HIGH |
| `@langchain/core` | ^1.2.0 | Mensagens/runnables p/ reflexão | Já em uso (deliberation/conversation). HIGH |
| `@langchain/langgraph` | ^1.4.4 | Grafo reativo (inalterado — reflexão NÃO é nó) | Já em uso. Reflexão fora do grafo (D-12). HIGH |
| `zod` | 4.4.3 | Schema da saída de reflexão + saída restrita | Já em uso (schemas.ts/structured.ts). HIGH |
| `js-tiktoken` | 1.0.21 | Orçamento de tokens da consolidação CP→LP | Já em uso (shortTerm.ts, o200k_base). HIGH |

### Supporting (a ADICIONAR)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `sqlite-vec` | **0.1.9** | Extensão vetorial (`vec0` virtual table, KNN cosseno, metadados filtráveis) | Índice semântico de MEM-03. `bun add sqlite-vec`. Verificado: `sqlite-vec-windows-x64@0.1.9` é optionalDependency → binário Windows distribuído. HIGH |

**Embeddings:** NÃO adicionar `OpenAIEmbeddings`/novo pacote. Usar `fetch` direto a `/v1/embeddings` (ver Pitfall 1). O LM Studio expõe `/v1/embeddings` OpenAI-compat. **Modelo recomendado:** `nomic-embed-text-v1.5` (string de modelo no LM Studio: tipicamente `text-embedding-nomic-embed-text-v1.5`), **dimensão 768**. MEDIUM-HIGH.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `sqlite-vec` (nativo) | `vectra@0.15.0` (JS puro, file-backed) | **Fallback documentado D-01.** Use se o `.load()` nativo falhar no Windows. Perde atomicidade cruzada (vetor em arquivo separado, não na transação SQLite) e o pré-filtro de metadados no KNN. Mantém o relacional em `bun:sqlite`. MEDIUM |
| `OpenAIEmbeddings` (LangChain) | `fetch` direto a `/v1/embeddings` | **Recomendado contornar.** OpenAIEmbeddings+LM Studio tem issues de travamento (§Pitfall 1). fetch direto é o que o probe já faz. HIGH |
| `vec0` metadata WHERE filter | JOIN manual events↔vec0 por rowid + filtro em JS | vec0 metadata filter é mais eficiente, mas o JOIN por `rowid` é mais simples de raciocinar no MVP. Ambos viáveis. Ver Pattern 4. |

**Installation:**
```bash
bun add sqlite-vec
```

**Version verification (2026-06-19, via `bun pm view`):**
- `sqlite-vec`: latest `0.1.9` (alpha `0.1.10-alpha.4`). optionalDependencies incluem `sqlite-vec-windows-x64@0.1.9`. → Windows OK. HIGH
- `vectra`: latest `0.15.0`. HIGH

## Architecture Patterns

### Recommended Project Structure
```
src/
├── memory/
│   ├── shortTerm.ts          # EXISTE — ring buffer (fonte da consolidação CP→LP)
│   ├── longTerm.ts           # NOVO — store SQLite: schema, vec0, retrieval scoring, importance heurística
│   ├── persistence.ts        # NOVO — serialize/hydrate do CognitiveStateHolder inteiro (D-04) + decay-on-boot (D-19)
│   └── embeddings.ts         # NOVO (ou método no provider) — fetch /v1/embeddings
├── social/
│   └── profiles.ts           # NOVO — upsert de players, atualização de trust por evento Mineflayer (D-15/D-16)
├── cognition/
│   ├── personality.ts        # NOVO — estado estruturado (humor/energia), contadores determinísticos (D-14)
│   ├── reflection.ts         # NOVO — gatilho híbrido + produto (consolidação + objetivos) via deliberação single-flight (D-12/D-13)
│   ├── state.ts              # EDITAR — holder ganha campos long-term/profiles/personality + db handle
│   ├── types.ts              # EDITAR — enum CognitiveState ganha 'reflecting'
│   ├── states.ts             # EDITAR — PRIORITY_ORDER ganha 'reflecting' (penúltimo)
│   ├── deliberation.ts       # EDITAR — gatilho 'reflect' + recuperação gatilhada (D-08)
│   └── loop.ts               # EDITAR — flush no shutdown, gatilho de reflexão por contexto
├── llm/
│   ├── prompts.ts            # EDITAR — injetar bloco de personalidade + trust do interlocutor sobre a baseline
│   ├── schemas.ts            # EDITAR — ReflectionOutputSchema (resumo + deltas de objetivo)
│   └── provider.ts           # EDITAR — adicionar embed(text): Promise<number[]>
├── chat/
│   └── conversation.ts       # EDITAR — eventos sociais → profiles/trust; gate de trust em pedido→objetivo
├── bot/index.ts              # EDITAR — abrir DB + hidratar holder do disco 1x no boot; flush no SIGINT/SIGTERM
└── config.ts                 # EDITAR — novos knobs .env (DB path, embedding model, limiares)
```

### Pattern 1: Carregar sqlite-vec em bun:sqlite (Windows)
**What:** Abre o DB e carrega a extensão nativa. Sem `setCustomSQLite` (macOS-only).
**When to use:** Inicialização do store (`longTerm.ts`).
```typescript
// Source: https://alexgarcia.xyz/sqlite-vec/js.html
import { Database } from 'bun:sqlite'
import * as sqliteVec from 'sqlite-vec'

export function openDb(path: string): Database {
  const db = new Database(path) // arquivo (não :memory:)
  sqliteVec.load(db)            // Windows: nenhuma config extra (diferente de node:sqlite/Deno)
  // PRAGMAs de durabilidade/performance (D-02):
  db.run('PRAGMA journal_mode = WAL')   // durabilidade sob crash
  db.run('PRAGMA synchronous = NORMAL') // WAL: NORMAL é seguro e ~2× mais rápido que FULL
  db.run('PRAGMA foreign_keys = ON')
  db.run('PRAGMA busy_timeout = 5000')  // evita SQLITE_BUSY transitório
  return db
}
```
> **Verificação de smoke (recomendar na Wave 0 do plano):** `select vec_version()` e `select vec_length(?)` com um `Float32Array` curto, para provar que a extensão carregou ANTES de qualquer escrita. Se lançar → cair para o fallback `vectra` (D-01) e logar.

### Pattern 2: Schema SQL exato (D-05) — events / players / places / vec0
**What:** Taxonomia híbrida. `events` append-only espelha o `MemEvent` tipado; `players`/`places` mutáveis (upsert); `vec_events` é o índice vetorial ligado a `events` por rowid.
```sql
-- Source: schema derivado de src/cognition/types.ts (MemEvent) + sqlite-vec metadata cols
-- https://alexgarcia.xyz/blog/2024/sqlite-vec-metadata-release/index.html

-- 1) EVENTS: append-only, espelha MemEvent (state_transition|action|world|chat_command)
CREATE TABLE IF NOT EXISTS events (
  id          INTEGER PRIMARY KEY,           -- rowid; liga ao vec0
  type        TEXT NOT NULL,                 -- 'state_transition'|'action'|'world'|'chat_command'
  ts          INTEGER NOT NULL,              -- timestamp ms (MemEvent.timestamp)
  importance  INTEGER NOT NULL,              -- 1..10 heurístico (D-06)
  summary     TEXT NOT NULL,                 -- texto canônico embeddado (ver Pattern 4)
  payload     TEXT NOT NULL,                 -- JSON do MemEvent original (fidelidade total)
  player      TEXT,                          -- username envolvido (para recuperação gatilhada D-08), nullable
  last_access INTEGER NOT NULL               -- ms do último retrieval (recência estilo Park) — init = ts
);
CREATE INDEX IF NOT EXISTS idx_events_ts     ON events(ts);
CREATE INDEX IF NOT EXISTS idx_events_player ON events(player);

-- 2) PLAYERS: estado social mutável, upsert por username (SOC-01/D-16)
CREATE TABLE IF NOT EXISTS players (
  username        TEXT PRIMARY KEY,
  display_name    TEXT,
  first_seen      INTEGER NOT NULL,
  last_seen       INTEGER NOT NULL,
  interactions    INTEGER NOT NULL DEFAULT 0,  -- frequência de interação
  trust           REAL    NOT NULL DEFAULT 0,  -- escalar determinístico (D-15), pode ser negativo
  notes           TEXT                         -- histórico curto (resumo textual, opcional)
);

-- 3) PLACES: landmarks mutáveis, upsert por chave (D-05)
CREATE TABLE IF NOT EXISTS places (
  key         TEXT PRIMARY KEY,              -- ex: 'home', 'mine_1' ou hash de coord arredondada
  label       TEXT,
  x           INTEGER NOT NULL,
  y           INTEGER NOT NULL,
  z           INTEGER NOT NULL,
  first_seen  INTEGER NOT NULL,
  last_seen   INTEGER NOT NULL,
  visits      INTEGER NOT NULL DEFAULT 1,
  notes       TEXT
);

-- 4) KV: estado vivo serializado do holder (needs/goals/currentGoal/disposition/personality) (D-04)
CREATE TABLE IF NOT EXISTS kv (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL,                       -- JSON
  ts    INTEGER NOT NULL
);

-- 5) VEC0: índice vetorial. rowid casa com events.id; metadados filtráveis no KNN.
--    Dimensão = 768 (nomic-embed-text-v1.5). distance_metric=cosine.
CREATE VIRTUAL TABLE IF NOT EXISTS vec_events USING vec0(
  embedding   float[768] distance_metric=cosine,
  ts          integer,                       -- metadata: filtra recência no KNN se desejado
  importance  integer,                       -- metadata: pré-filtro por importância (evolução D-07)
  +event_id   integer                        -- auxiliar (não filtrável): liga de volta a events.id
);
```
> **Nota de versão de schema:** guardar `PRAGMA user_version` (ex.: `db.run('PRAGMA user_version = 1')`). Migrations futuras checam e aplicam `ALTER TABLE`. Mantém D-03 (cold start) trivial: se `user_version=0`, roda todo o DDL acima.

### Pattern 3: Write-through transacional + flush (D-02/D-03)
**What:** Escrever evento + embedding atomicamente; recuperação graceful na abertura.
```typescript
// Source: bun:sqlite transactions — https://bun.com/docs/runtime/sqlite
// Escrita atômica: events + vec_events na MESMA transação (atomicidade cruzada que vectra não dá)
const insertEvent = db.prepare(
  `INSERT INTO events (type, ts, importance, summary, payload, player, last_access)
   VALUES (?, ?, ?, ?, ?, ?, ?)`,
)
const insertVec = db.prepare(
  `INSERT INTO vec_events (rowid, embedding, ts, importance, event_id)
   VALUES (?, ?, ?, ?, ?)`,
)
const persistEvent = db.transaction(
  (ev: { type: string; ts: number; importance: number; summary: string; payload: string; player: string | null }, emb: Float32Array) => {
    const res = insertEvent.run(ev.type, ev.ts, ev.importance, ev.summary, ev.payload, ev.player, ev.ts)
    const id = Number(res.lastInsertRowid)
    insertVec.run(id, emb, ev.ts, ev.importance, id) // rowid = events.id casa as duas tabelas
    return id
  },
)
```
**Recuperação graceful (D-03):** envolver a abertura/queries em try/catch. Se `PRAGMA integrity_check` falhar ou uma query lançar `SQLITE_CORRUPT`, logar a perda, tentar `PRAGMA quick_check` por tabela, e **continuar com o que for legível** — nunca abortar (Core Value: o loop precisa rodar). Se o DB inteiro estiver irrecuperável, renomear o arquivo para `*.corrupt-<ts>` e cold-start um novo (D-03).

### Pattern 4: Retrieval scoring (MEM-03 / D-07 — Generative Agents, Park et al. 2023)
**What:** Recência × importância × relevância, min-max normalizados para [0,1], somados com pesos iguais (α=1). Constantes CODÁVEIS abaixo.
```typescript
// Source: Park et al. 2023 §"Retrieval" — https://arxiv.org/pdf/2304.03442
// recency: decaimento exponencial. O paper usa fator 0.995 por HORA-DE-JOGO sobre o tempo
// desde o último acesso. Adaptação para tempo real (ms): meia-vida configurável.

const RECENCY_HALF_LIFE_MS = 6 * 60 * 60 * 1000  // 6h: peso cai à metade a cada 6h reais (ajustável)
const RETRIEVAL_K = 12                            // candidatos KNN antes da reordenação ponderada
// Pesos iguais α=1 (D-07). Constantes nomeadas para evolução futura sem mudar a fórmula.
const W_RECENCY = 1, W_IMPORTANCE = 1, W_RELEVANCE = 1

function recencyRaw(ageMs: number): number {
  // 0.5 ^ (age / halfLife) — equivalente a decaimento exponencial; ∈ (0,1]
  return Math.pow(0.5, ageMs / RECENCY_HALF_LIFE_MS)
}
function minMax(xs: number[]): (x: number) => number {
  const lo = Math.min(...xs), hi = Math.max(...xs)
  const span = hi - lo
  return (x) => (span === 0 ? 0 : (x - lo) / span)  // se todos iguais → 0 (Park trata empate)
}
// relevance = 1 - distance (vec0 cosine retorna distance = 1 - cos_sim ∈ [0,2]; clamp em [0,1])
```
**Fluxo de recuperação (gatilhado, D-08):**
1. Embeddar o "query" (ex.: contexto do encontro com jogador, ou no Reflecting o resumo recente).
2. KNN no `vec_events` (`MATCH ? AND k = RETRIEVAL_K`), opcionalmente filtrando por `player`/`importance` via metadata WHERE.
3. Para cada candidato: `recency = recencyRaw(now - last_access)`, `importance = events.importance` (1–10), `relevance = 1 - distance`.
4. Min-max normalizar cada vetor de fatores SOBRE OS CANDIDATOS, somar com pesos (α=1), ordenar desc.
5. Ao recuperar de fato → `UPDATE events SET last_access = now` (renova a recência, fiel ao Park).

```sql
-- KNN com filtro de metadados (recuperação gatilhada por jogador, D-08)
-- Source: https://alexgarcia.xyz/blog/2024/sqlite-vec-metadata-release/index.html
SELECT v.rowid, v.event_id, v.distance, e.importance, e.last_access, e.summary, e.payload
FROM vec_events v
JOIN events e ON e.id = v.rowid
WHERE v.embedding MATCH ?      -- Float32Array do query
  AND k = 12;                  -- (opcional) AND v.importance >= 4  para pré-filtrar
```
> **Importance heurística por tipo de MemEvent (D-06) — mapeamento 1–10 codável:**
> | MemEvent | Condição | Importance |
> |----------|----------|-----------|
> | `world` | `event='damage'` | **9** (perigo — alto) |
> | `world` | `event='player_joined'` (primeiro contato do username) | **8** |
> | `world` | `event='player_joined'` (já conhecido) | **4** |
> | `world` | `event='hunger'` | **6** |
> | `world` | `event='player_left'` | **3** |
> | `chat_command` | qualquer (pedido/comando de jogador) | **7** |
> | `action` | `result='failure'` | **6** (falha é instrutiva) |
> | `action` | `result='success'` de gather/collect | **5** |
> | `action` | `result='success'` mundano (navigate/idle) | **2** |
> | `state_transition` | para `socializing`/`fighting` | **5** |
> | `state_transition` | mundano (idle↔exploring) | **1** |
> Limiar de "vale persistir em LP" sugerido: `importance >= 3` (descarta ticks triviais — controla o crescimento do DB). Ajustável via `.env`.

### Pattern 5: Reflexão como deliberação single-flight (REFL-01 / D-10/D-12/D-13)
**What:** A reflexão reusa `maybeDeliberate` (não cria nó no grafo). O gatilho híbrido enfileira a intenção; o lock single-flight garante exclusão; o fallback (arbiter) cobre falha.
**Gatilho híbrido (D-10) — constantes codáveis:**
```typescript
const REFLECTION_IMPORTANCE_THRESHOLD = 50   // soma de importância de eventos desde a última reflexão (estilo Stanford ~150 escalado p/ MVP)
const REFLECTION_MAX_INTERVAL_MS = 10 * 60 * 1000  // teto anti-starvation: reflete a cada 10min no máximo, mesmo sob carga
// Gatilho dispara reflect se QUALQUER:
//  (a) event-driven: entrou em 'idle' E (currentGoal concluído OU falho)
//  (b) acúmulo: soma de importance(eventos novos) >= REFLECTION_IMPORTANCE_THRESHOLD
//  (c) piso temporal: now - lastReflectionAt >= REFLECTION_MAX_INTERVAL_MS
```
**Encaixe SEM nó novo:** adicionar `'reflect'` a `DeliberationTrigger` em `deliberation.ts`. Em `loop.ts`, quando o gatilho híbrido acende, chamar `void deliberator.maybeDeliberate(..., 'reflect', now)`. Dentro de `maybeDeliberate`, ramificar: se `trigger === 'reflect'`, usar `buildReflectionPrompt` + `decideReflection` (novo schema) em vez de `decideAction`. O lock `inFlight` já garante que reflexão nunca sobreponha decisão de ação (D-12). Fallback: se LLM off/inválido → **no-op gracioso** (consolidação ainda pode rodar deterministicamente; objetivos ficam inalterados — D-13).
**Produto faseado (D-13) — schema Zod:**
```typescript
// src/llm/schemas.ts — saída restrita da reflexão (resumo + deltas de objetivo)
export const ReflectionOutputSchema = z.object({
  summary: z.string().max(500),                       // consolidação CP→LP: 1-2 frases promovidas a evento episódico
  goalUpdates: z.array(z.object({
    id: z.string(),
    action: z.enum(['keep', 'drop', 'reprioritize']),
    priority: z.number().min(0).max(1).optional(),
  })).max(8).default([]),                              // reordenação de objetivos; vazio = no-op (fallback seguro)
})
```
**Consolidação CP→LP (sempre, mesmo sem LLM):** o `summary` da reflexão (ou, no fallback, uma concatenação determinística dos N eventos de maior importância do ring buffer) vira **um novo evento episódico** persistido em `events` (type derivado, importance alta) + embeddado. Isso é o "promover curto→longo prazo".

### Pattern 6: Personalidade estruturada + trust (SOC-02/SOC-01 / D-14/D-15/D-17)
**What:** Estado mutável de poucos campos, atualizado por contadores determinísticos, reinjetado no prompt sobre a baseline imutável. NENHUM parâmetro treinado (fronteira estrutural vs ADV-01).
```typescript
// src/cognition/personality.ts (D-14) — campos exatos sugeridos
export interface PersonalityState {
  mood: number          // -1..1  (humor): + por sucessos/ajuda recebida, - por dano/falhas
  socialEnergy: number  // 0..1   (energia social): sobe com tempo, cai a cada interação (D-18 social need)
  confidence: number    // 0..1   (autoconfiança): sobe com goals concluídos, cai com falhas repetidas
  updatedAt: number
}
// Regras determinísticas de update (exemplos — derivadas de MemEvent, sem LLM):
//   world/damage           → mood -= 0.15 (clamp -1)
//   action success (goal)  → mood += 0.05; confidence += 0.05
//   action failure         → confidence -= 0.08
//   interação social        → socialEnergy -= 0.1 (recarrega +0.01/min)
// Decaimento natural ao boot: mood→0, confidence→baseline ao longo do tempo (mean-reversion).
```
**Trust por jogador (D-15) — eventos verificáveis do Mineflayer:**
```typescript
// src/social/profiles.ts — deltas determinísticos (LLM nunca calcula trust)
const TRUST_DELTA = {
  gaveItem:   +0.20,  // bot.on('playerCollect') / detecção de item recebido
  helped:     +0.10,  // jogador ajudou (ex.: matou mob hostil próximo)
  attacked:   -0.40,  // bot tomou dano com source = jogador (entityHurt / health drop + atacante)
  stole:      -0.30,
  interaction:+0.01,  // mera frequência (pequeno)
}
const TRUST_MIN = -1, TRUST_MAX = 1
// Limiar de gate (D-17): pedido-vira-objetivo em ASSISTANT só se trust >= TRUST_REQUEST_THRESHOLD
const TRUST_REQUEST_THRESHOLD = 0.0   // conservador: neutro+ basta; hostil (<0) é bloqueado
```
**Eventos do Mineflayer para trust (verificados como existentes na API mineflayer 4.x):**
- `entityHurt` / queda de `bot.health` com atacante identificável → `attacked`.
- `playerCollect(collector, collected)` → se `collector === bot.entity` e o item veio de um jogador → `gaveItem` (heurística).
- Frequência: incrementar `interactions` a cada mensagem/proximidade do jogador (já há `socialRadius` na config).
**Injeção no prompt (D-17 "cor de prompt"):** em `buildPersonaPrompt`, anexar um bloco derivado do `PersonalityState` + (no caminho conversacional) o `trust` do interlocutor:
```typescript
// Sobre a PERSONA_BASE imutável (prompts.ts):
`Estado interno atual: humor ${moodWord(p.mood)}, energia social ${pct(p.socialEnergy)}, confiança ${pct(p.confidence)}.`
// + no conversation.ts, por interlocutor:
`Sobre ${username}: confiança ${trustWord(trust)} (interações: ${interactions}).` // trust<0 → "mantenha distância, seja cauteloso"
```

### Pattern 7: Holder durável — serialize/hydrate + decay-on-boot (D-04/D-19)
**What:** Persistir o `CognitiveStateHolder` inteiro e re-hidratá-lo no boot, aplicando decaimento por timestamp ao estado vivo.
```typescript
// src/memory/persistence.ts (D-04). control/safety são por-sessão (recriados);
// PERSISTIR: needs, goals, currentGoal, disposition, personality. Memória LP já vive no DB.
function persistHolder(db: Database, holder: CognitiveStateHolder, now: number): void {
  const snap = {
    needs: holder.needs, goals: holder.goals, currentGoal: holder.currentGoal,
    disposition: holder.disposition, personality: holder.personality,
  }
  db.prepare('INSERT OR REPLACE INTO kv (key, value, ts) VALUES (?, ?, ?)')
    .run('holder', JSON.stringify(snap), now)
}
function hydrateHolder(db: Database, base: CognitiveStateHolder, now: number): CognitiveStateHolder {
  const row = db.prepare('SELECT value FROM kv WHERE key = ?').get('holder') as { value: string } | undefined
  if (!row) return base // cold start (D-03)
  const snap = JSON.parse(row.value)
  // DECAY-ON-BOOT (D-19): aplicar tempo decorrido em vez de retomar cego.
  //  - needs: re-decair a partir de lastSatisfiedAt usando o mesmo decaimento da Fase 3 (evaluateNeeds com now atual)
  //  - goals: descartar os com committedAt velho demais (stale) — re-avaliar frescor
  const GOAL_STALE_MS = 30 * 60 * 1000 // objetivo comprometido há >30min é descartado, não retomado cego
  const goals = snap.goals.filter((g: Goal) => now - g.committedAt < GOAL_STALE_MS)
  return { ...base, needs: snap.needs, goals, currentGoal: goals.includes(snap.currentGoal) ? snap.currentGoal : null,
           disposition: snap.disposition, personality: snap.personality ?? defaultPersonality(now) }
}
```
**Boot em `bot/index.ts` (UMA vez, antes do loop):** abrir DB, `hydrateHolder`, guardar `db` no holder. **Flush no shutdown:** `process.on('SIGINT'|'SIGTERM', () => { persistHolder(...); db.close(); process.exit(0) })` (D-02 flush gracioso). Adicionalmente, `persistHolder` ao fim de cada ciclo de reflexão (D-02).

### Anti-Patterns to Avoid
- **`OpenAIEmbeddings` do LangChain.js apontado ao LM Studio:** trava/falha silenciosa (issues abertas). Usar fetch direto. (§Pitfall 1)
- **Pontuar importância via LLM no caminho de escrita:** mata o loop sempre-ativo com modelo fraco (D-06). Heurística por tipo de evento.
- **Recuperação semântica a cada deliberação:** custo de embedding por tick + inflação de tokens (D-08). Só gatilhada + Reflecting.
- **Reflexão como nó do StateGraph:** quebra o single-flight e a separação reativo/deliberativo (D-12). Reusar `maybeDeliberate`.
- **Snapshot periódico como única durabilidade:** reintroduz janela de perda (D-02). Write-through + WAL.
- **`better-sqlite3`/`SqliteSaver` no Bun:** ABI/NAPI quebra (STACK.md). `bun:sqlite`.
- **Embeddar o JSON cru do MemEvent:** ruim para similaridade semântica. Embeddar um `summary` em linguagem natural (ex.: "Tomei 4 de dano de um zombie à noite perto de (120, 64, -30)").

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Índice vetorial / KNN | Loop de cosseno em JS sobre todos os eventos | `vec0` virtual table (`MATCH ... AND k = N`) | O(n) em JS degrada; vec0 é otimizado e filtra metadados no mesmo query |
| Armazenamento atômico vetor+relacional | Dois arquivos (JSON + .bin) sincronizados à mão | `bun:sqlite` transaction (events + vec_events) | Atomicidade cruzada (a justificativa central de D-01 vs vectra) |
| Durabilidade sob crash | Escrita de arquivo + rename atômico próprio | `PRAGMA journal_mode=WAL` | WAL é battle-tested; rename manual no Windows tem casos-limite |
| Migrations de schema | Detecção ad-hoc de colunas | `PRAGMA user_version` + DDL versionado | Padrão SQLite canônico, trivial de evoluir |
| Tokenização p/ orçamento da consolidação | Heurística chars/4 | `js-tiktoken` (já em uso) | Já integrado em shortTerm.ts |
| Saída estruturada da reflexão | Parsing de string livre do LLM | `zod` + `decide` (já em structured.ts) | Modelo local faz drift; repair/fallback já existe |

**Key insight:** A decisão D-01 (um único SQLite com vec0) só "vale a pena" por causa da **atomicidade cruzada** e do **filtro de metadados no KNN**. Hand-roll de qualquer uma das duas reintroduz exatamente as fraquezas do fallback `vectra` que D-01 escolheu evitar.

## Common Pitfalls

### Pitfall 1: OpenAIEmbeddings (LangChain.js) trava com LM Studio
**What goes wrong:** `new OpenAIEmbeddings({ configuration: { baseURL } })` apontado ao LM Studio trava sem erro ou falha o payload do POST.
**Why it happens:** Issues conhecidas (langchainjs#3086 — baseURL difícil de configurar; lmstudio-js#18 — embeddings travam; langchain#21318 — payload inválido). O cliente assume comportamentos do endpoint OpenAI real que o LM Studio não replica 100% para embeddings.
**How to avoid:** **Chamar `/v1/embeddings` via `fetch` direto** (o `provider.ts` já faz fetch ao `/models`). Adicionar ao `LlmProvider`:
```typescript
// provider.ts — embed via fetch (sem dependência de OpenAIEmbeddings)
async embed(text: string): Promise<number[]> {
  const res = await fetch(`${baseURL.replace(/\/$/, '')}/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: process.env.EMBEDDING_MODEL || 'text-embedding-nomic-embed-text-v1.5',
                           input: text.replace(/\n/g, ' ') }),
  })
  if (!res.ok) throw new Error(`embeddings ${res.status}`)
  const json = await res.json() as { data: { embedding: number[] }[] }
  return json.data[0].embedding   // 768 floats p/ nomic-embed-text-v1.5
}
```
**Warning signs:** deliberação/reflexão que "pendura"; nenhum vetor escrito apesar de eventos chegando.

### Pitfall 2: Dimensão do embedding não bate com o vec0
**What goes wrong:** `vec0(embedding float[768])` mas o modelo retorna outra dimensão → INSERT lança.
**Why it happens:** Modelos diferentes (ou nomic v1.5 com matryoshka truncado) produzem dimensões diferentes (64–768).
**How to avoid:** Fixar `EMBEDDING_DIM` na config; no boot, fazer um embed de teste e **validar `length === EMBEDDING_DIM`** antes de criar/usar a tabela. Se divergir, abortar a criação do índice e logar (o relacional ainda funciona). nomic-embed-text-v1.5 default = **768**.
**Warning signs:** `INSERT INTO vec_events` lança "dimension mismatch".

### Pitfall 3: `vec0` espera Float32Array, não array JS
**What goes wrong:** Passar `number[]` direto ao bind → erro ou serialização errada.
**Why it happens:** sqlite-vec espera um BLOB de float32 (ou JSON string). O caminho mais seguro em Bun é `new Float32Array(embedding)`.
**How to avoid:** Converter `new Float32Array(embeddingArray)` antes do bind, tanto no INSERT quanto no MATCH.
**Warning signs:** distâncias absurdas / erro de tipo no prepare.

### Pitfall 4: Estado vivo retomado "cego" após restart (estálido)
**What goes wrong:** Bot retoma um `currentGoal` de 2h atrás ou `needs` congelados como estavam no shutdown.
**Why it happens:** Persistir sem aplicar o tempo decorrido (D-04 persiste tudo, mas D-19 exige decaimento).
**How to avoid:** `hydrateHolder` re-decai needs a partir de `lastSatisfiedAt` com o `now` atual e descarta goals com `committedAt` velho (`GOAL_STALE_MS`). (§Pattern 7)
**Warning signs:** após restart, o bot persegue um objetivo sem sentido ou ignora fome real.

### Pitfall 5: WAL deixa arquivos `-wal`/`-shm` órfãos no Windows
**What goes wrong:** Kill abrupto deixa `db-wal`/`db-shm`; em raros casos o checkpoint não fecha.
**Why it happens:** WAL mantém arquivos auxiliares; fechar sem checkpoint os deixa.
**How to avoid:** `db.close()` no SIGINT/SIGTERM (faz checkpoint). Opcional: `PRAGMA wal_checkpoint(TRUNCATE)` no flush de reflexão. SQLite recupera sozinho do `-wal` na próxima abertura — não deletar manualmente.
**Warning signs:** arquivos `-wal` grandes persistindo entre execuções.

### Pitfall 6: Crescimento ilimitado de `events`/`vec_events`
**What goes wrong:** Loop sempre-ativo escreve milhares de eventos/dia → DB incha, KNN desacelera.
**Why it happens:** Sem política de retenção.
**How to avoid:** Limiar `importance >= 3` para persistir (descarta ticks triviais, §Pattern 4). Opcional: poda periódica no Reflecting (deletar eventos `importance<=2` mais velhos que X). MVP: só o limiar de escrita basta.
**Warning signs:** arquivo do DB crescendo MB/hora; KNN ficando lento.

## Code Examples

### Embeddar um MemEvent (técnica de geração — D-09)
```typescript
// Gera o texto NL canônico a embeddar (NÃO o JSON cru). Determinístico, sem LLM.
function summarizeEvent(e: MemEvent): string {
  switch (e.type) {
    case 'world':
      return `Evento de mundo: ${e.event} — ${e.detail}.`
    case 'action':
      return `Ação ${e.skill} em ${e.target}: ${e.result}${e.reason ? ` (${e.reason})` : ''}.`
    case 'state_transition':
      return `Mudei de estado: ${e.from} → ${e.to}.`
    case 'chat_command':
      return `Comando de chat de ${e.from}: "${e.command}" (modo ${e.mode}).`
  }
}
// Pipeline de escrita LP: summarizeEvent → provider.embed(summary) → persistEvent (transação)
```

### Upsert de player + trust (SOC-01/D-15)
```typescript
// Source: bun:sqlite UPSERT — SQLite ON CONFLICT
const upsertPlayer = db.prepare(`
  INSERT INTO players (username, display_name, first_seen, last_seen, interactions, trust)
  VALUES (?, ?, ?, ?, 1, 0)
  ON CONFLICT(username) DO UPDATE SET
    last_seen = excluded.last_seen,
    interactions = interactions + 1,
    display_name = excluded.display_name
`)
const bumpTrust = db.prepare(
  `UPDATE players SET trust = max(-1, min(1, trust + ?)) WHERE username = ?`,
)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `sqlite-vss` | `sqlite-vec` | 2024 | sqlite-vss deprecado; sqlite-vec é o sucessor (single .so/.dll, sem deps de faiss) |
| vec0 só vetor | vec0 com **metadata + auxiliary + partition** columns | set/2024 (release de metadata) | Filtro `WHERE` no KNN sem JOIN — habilita a recuperação gatilhada por jogador (D-08) |
| `OpenAIEmbeddings` p/ endpoints OpenAI-compat | `fetch` direto p/ LM Studio | persistente | LangChain.js não cobre bem LM Studio embeddings (Pitfall 1) |

**Deprecated/outdated:**
- `sqlite-vss`: substituído por `sqlite-vec`.
- `better-sqlite3` no Bun: não suportado (usar `bun:sqlite`).

## Open Questions

1. **String exata do modelo de embedding no LM Studio**
   - What we know: nomic-embed-text-v1.5, 768 dims, via `/v1/embeddings`. Nomes comuns: `text-embedding-nomic-embed-text-v1.5`.
   - What's unclear: o `model` aceito depende do que o usuário carregou no LM Studio; alguns builds aceitam qualquer string (usam o modelo carregado).
   - Recommendation: tornar `EMBEDDING_MODEL` configurável (.env) com default `text-embedding-nomic-embed-text-v1.5`; validar a dimensão no boot (Pitfall 2). Documentar no plano um passo "carregar um embedding model no LM Studio".

2. **`vec0` bind: Float32Array vs JSON string em bun:sqlite**
   - What we know: docs mostram `Float32Array` no bind e `vec_length(?)` funcionando.
   - What's unclear: comportamento exato do bind de `Float32Array` como BLOB em `bun:sqlite` (vs `node:sqlite`). Pode exigir `Buffer.from(f32.buffer)`.
   - Recommendation: Wave 0 — smoke test de round-trip (insert + KNN de 1 vetor conhecido) ANTES de construir o pipeline. Se `Float32Array` direto falhar, usar `Buffer.from(f32.buffer)`.

3. **Detecção robusta de "atacado por jogador" no Mineflayer**
   - What we know: `entityHurt` e queda de `bot.health` existem; identificar o atacante humano é heurístico.
   - What's unclear: atribuir o dano a um jogador específico de forma confiável (Minecraft nem sempre expõe a fonte).
   - Recommendation: MVP — usar proximidade + timing (jogador próximo + dano simultâneo → suspeita de `attacked`). Aceitar imperfeição; trust é determinístico mas a *detecção* é heurística. Documentar como gap conhecido.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Bun runtime | Tudo (bun:sqlite) | ✓ | 1.3.x (confirmado Fase 1–3) | Node + better-sqlite3 (NÃO — D-01 proíbe no Bun) |
| `sqlite-vec` binário Windows | Índice vetorial (MEM-03) | ✓ (a instalar) | `sqlite-vec-windows-x64@0.1.9` (optionalDep verificada) | `vectra@0.15.0` (JS puro, D-01 fallback) |
| LM Studio `/v1/embeddings` | Embeddings (D-09) | ⚠ runtime (usuário liga o servidor) | — | Sem embeddings → relevância indisponível; recuperação cai para recência×importância (graceful) |
| LM Studio embedding model carregado | Embeddings | ⚠ usuário carrega | nomic-embed-text-v1.5 (768d) | Idem acima |

**Missing dependencies with no fallback:** Nenhuma bloqueante. `sqlite-vec` tem binário Windows; se falhar, `vectra` cobre.
**Missing dependencies with fallback:**
- LM Studio embeddings off no runtime → degradar graciosamente: persistir eventos SEM embedding (vetor null/skip vec_events), recuperação usa apenas recência×importância até o servidor voltar. Coerente com D-17 (degradação graciosa já é padrão do projeto).
- `sqlite-vec.load()` falha → `vectra` (D-01 fallback documentado).

## Sources

### Primary (HIGH confidence)
- `bun pm view sqlite-vec` / `bun pm view vectra` (executado 2026-06-19) — versões `0.1.9` / `0.15.0`; `sqlite-vec-windows-x64@0.1.9` confirmado como optionalDependency (binário Windows existe).
- https://alexgarcia.xyz/sqlite-vec/js.html — `import * as sqliteVec; sqliteVec.load(db)` em bun:sqlite; `setCustomSQLite` é **macOS-only**; embeddings como `Float32Array`.
- https://alexgarcia.xyz/blog/2024/sqlite-vec-metadata-release/index.html — CREATE VIRTUAL TABLE vec0 com metadata/partition/auxiliary cols; operadores de filtro (`=`,`!=`,`<`,`>`,`<=`,`>=`,`BETWEEN`,`IN`); KNN SELECT com `MATCH`+`k=`+WHERE de metadados verbatim.
- https://arxiv.org/pdf/2304.03442 (Park et al. 2023) — memory stream: recência (decaimento exp., fator 0.995/hora), importância 1–10, relevância (cosseno), min-max + pesos iguais.
- Código existente lido e verificado: `state.ts`, `types.ts`, `states.ts`, `shortTerm.ts`, `motivation/types.ts`, `deliberation.ts`, `loop.ts`, `prompts.ts`, `structured.ts`, `schemas.ts`, `conversation.ts`, `config.ts`, `bot/index.ts`, `provider.ts`, `perception/types.ts` — todas as exports/assinaturas citadas existem.
- `CLAUDE.md` / `research/STACK.md` — bun:sqlite vs better-sqlite3, sqlite-vec vs sqlite-vss, caveat de baseURL.

### Secondary (MEDIUM confidence)
- https://github.com/asg017/sqlite-vec/issues/121 / #196 — auxiliary columns não filtráveis; padrão JOIN+WHERE por rowid.
- LM Studio embeddings: nomic-embed-text-v1.5 = 768d (Cognee/AI-SDK docs, HuggingFace zpn) — string de modelo varia por build.
- https://lmstudio.ai/docs/developer/openai-compat/embeddings — `/v1/embeddings` request/response shape (model+input → data[].embedding).

### Tertiary (LOW confidence — flagged for validation)
- https://github.com/langchain-ai/langchainjs/issues/3086, https://github.com/lmstudio-ai/lmstudio-js/issues/18 — OpenAIEmbeddings+LM Studio problemático (sem resolução visível). → Mitigado por fetch direto (não dependemos de resolução).
- Bind exato de `Float32Array` em bun:sqlite (vs `Buffer.from`) — validar em Wave 0 (Open Question 2).
- Atribuição de dano a jogador específico no Mineflayer — heurístico (Open Question 3).

## Metadata

**Confidence breakdown:**
- Persistência / schema / PRAGMAs: **HIGH** — bun:sqlite + sqlite-vec verificados; binário Windows confirmado; DDL derivado do MemEvent real.
- Retrieval scoring (MEM-03): **HIGH** — fórmula Generative Agents bem documentada; constantes propostas razoáveis (ajustáveis).
- Reflexão (REFL-01): **HIGH** — encaixe no `maybeDeliberate`/`DeliberationTrigger` existente verificado em código.
- Perfis/trust/personalidade (SOC-01/02): **MEDIUM-HIGH** — schema e regras determinísticas sólidos; detecção de "atacado por jogador" é heurística (OQ3).
- Embeddings (D-09): **MEDIUM** — endpoint OK, mas caminho LangChain frágil → recomendado fetch direto; string de modelo/dimensão a validar no boot.

**Research date:** 2026-06-19
**Valid until:** ~2026-07-19 (sqlite-vec é pré-1.0 — checar dist-tags antes de upgrade; alpha 0.1.10 em curso)
