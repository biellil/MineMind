# Stack Research

**Domain:** Autonomous persistent Minecraft Java agent (TypeScript, single-process, local LLM)
**Researched:** 2026-06-18
**Confidence:** HIGH (versions verified against npm registry; Bun/Mineflayer verdict cross-referenced with PrismarineJS and Bun release notes)

## Executive Verdict (read this first)

**Run the Mineflayer layer on Node, not Bun — but only barely.** The blocking factor is NOT crypto (Bun fixed Minecraft's Diffie-Hellman/cipher path in v1.1.45–1.2.6). The blocking factor is **NAPI native addons compiled with node-gyp**: Bun deliberately does not prioritize full Node-API addon compatibility, and the two addons this project may touch — `node-canvas-webgl` (required by `prismarine-viewer` headless mode) and `better-sqlite3` — fail or require recompilation under Bun.

**Recommended path:** Use **Bun as package manager** (`bun install`, fast, native TS) and **Node ≥20 LTS as the runtime** for the agent process. This honors the "Bun-first, Node fallback" constraint while sidestepping the only real incompatibilities. If you drop `prismarine-viewer` (it is a debug-only feature, not part of the cognitive loop) and use **`bun:sqlite`** instead of `better-sqlite3`, you can run the whole process on Bun. Decide per the variant table below.

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Node.js | 20.x or 22.x LTS | Runtime for the agent process | Officially tested target for Mineflayer (requires ≥18); guarantees node-gyp NAPI addons work. Use as runtime; Bun as fallback-inverted (see verdict). HIGH |
| Bun | 1.2.x | Package manager + TS transpilation (and *optional* runtime) | Native TS, fast installs/scripts, built-in SQLite. Crypto for Minecraft auth now works (v1.2.6). Held back only by node-gyp NAPI addons. HIGH |
| TypeScript | 5.x | Language | Project constraint; first-class with both runtimes. HIGH |
| mineflayer | 4.37.1 | Minecraft Java game interface (perception + actuation) | The de-facto standard high-level Java bot API. Supports MC 1.8–1.21.11. Node-only by design. HIGH |
| minecraft-protocol | 1.66.2 | Transitive — packet parse/serialize, auth, encryption | Mineflayer's transport layer (PrismarineJS). Pulled in automatically; pin via mineflayer. HIGH |
| @langchain/langgraph | 0.4.x | Cognitive loop orchestration (Observe→Analyze→Plan→Execute→Reflect as a StateGraph) | The standard TS framework for stateful, cyclic agent graphs. Cycles + shared annotated state + checkpointing map directly onto your cognitive-loop spec. HIGH |
| @langchain/core | 0.x (peer) | Core abstractions (messages, runnables) | Required peer of langgraph + openai integration. HIGH |
| @langchain/openai | 0.x | LLM + embeddings client pointed at LM Studio | `ChatOpenAI`/`OpenAIEmbeddings` accept a `configuration.baseURL`, so LM Studio's OpenAI-compatible endpoint is a drop-in. HIGH |
| LM Studio | current desktop app | Local LLM + embedding server (OpenAI-compatible) | Exposes `/v1/chat/completions` and `/v1/embeddings` on `http://localhost:1234/v1`. Zero cost, no rate limits — ideal for an always-on loop. HIGH |

**Version note on LangGraph JS:** npm registry reports the `latest` dist-tag of `@langchain/langgraph` resolving to the 0.4.x line as of this research. The library is post-1.0-stable in maturity (production-ready since mid-2025) but still on a 0.x SemVer track; pin exactly and review the changelog before bumping. MEDIUM (exact patch moves frequently).

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| mineflayer-pathfinder | 2.4.5 | A* navigation / goal-based movement | Always — required for the "Move/navigate autonomously" requirement and Exploring/Gathering states. HIGH |
| mineflayer-collectblock | 1.4.4 | High-level "collect block X" behavior | Gathering state; resource-need fulfillment. Sits on top of pathfinder. HIGH |
| mineflayer-pvp | 1.3.2 | Combat targeting/strafing | Only when Fighting state is implemented (later phase). MEDIUM |
| mineflayer-armor-manager | 2.0.1 | Auto-equip best armor | Optional survival QoL; defer past MVP. LOW (nice-to-have) |
| @langchain/langgraph-checkpoint-sqlite | 1.0.3 | Persists LangGraph state between loop ticks/restarts (the "always-on / survives restart" property) | Recommended for short-term/working memory + loop resumption. Uses `better-sqlite3` under the hood (Node). HIGH |
| sqlite-vec | 0.1.9 | Local vector index inside SQLite for semantic long-term memory | Recommended semantic-memory store: one DB file, KNN search, no extra service. Successor to sqlite-vss. HIGH |
| vectra | 0.15.0 | Pure-JS local vector store (file-backed, no native build) | Use *instead of* sqlite-vec if you run on Bun and want zero native addons. MEDIUM |
| zod | 4.4.3 | Structured-output schemas / tool-arg validation for LLM calls | Use to constrain LM Studio JSON output (plans, decisions) — local models drift without schema enforcement. HIGH |

### Persistence layer — pick by runtime

| Memory tier | On Node (recommended) | On Bun |
|-------------|-----------------------|--------|
| Short-term / working (recent events, conversation window) | LangGraph `SqliteSaver` checkpointer (better-sqlite3) | `bun:sqlite` hand-rolled state table, or in-memory `MemorySaver` + periodic JSON snapshot |
| Long-term episodic (facts, social profiles per player) | `better-sqlite3` relational tables | `bun:sqlite` (3–6× faster than better-sqlite3, built-in) |
| Semantic (embeddings for "what do I remember about X?") | SQLite + `sqlite-vec` extension | `vectra` (pure JS) or `bun:sqlite` + load `sqlite-vec` loadable extension |

**Embeddings:** Use LM Studio's `/v1/embeddings` with a dedicated embedding model — **`nomic-embed-text-v1.5`** (LM Studio's default, 768-dim) or `bge-small-en-v1.5`. Call via `OpenAIEmbeddings({ model: "text-embedding-nomic-embed-text-v1.5", configuration: { baseURL: "http://localhost:1234/v1" }, apiKey: "lm-studio" })`. Load the embedding model as a *second* loaded model in LM Studio alongside the chat model. HIGH

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Bun | Install/scripts/test runner | `bun install`, `bun run`, `bun test`. Use even if Node is the runtime. |
| tsx (if on Node) | Run TS directly without a build step | `tsx watch src/index.ts` for dev loop; Bun runs TS natively so only needed on Node. |
| Paper / Spigot local server | Controlled test world | Pin server to a Mineflayer-supported MC version (e.g. 1.20.4 or 1.21.x). Offline-mode for no auth during dev. |
| LM Studio | Local model host | Enable the server in the Developer tab; load one chat model + one embedding model. |

## Installation

```bash
# Core (Bun as package manager)
bun add mineflayer mineflayer-pathfinder mineflayer-collectblock
bun add @langchain/langgraph @langchain/core @langchain/openai
bun add zod

# Persistence — Node runtime variant
bun add @langchain/langgraph-checkpoint-sqlite better-sqlite3 sqlite-vec

# Persistence — Bun runtime variant (no native node-gyp addons)
bun add vectra            # bun:sqlite is built into the runtime, no install

# Optional / later phases
bun add mineflayer-pvp mineflayer-armor-manager

# Dev (Node runtime only — Bun runs TS natively)
bun add -D tsx typescript @types/node
```

> If running on **Node**, native addons (`better-sqlite3`, optional `node-canvas-webgl`) compile against Node's ABI automatically. If you ever `bun install` then `node` run, addons compiled under Bun's ABI will throw `napi_register_module_v1 not found` — keep install + run on the same runtime, or rebuild.

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Node runtime for agent | Bun runtime for agent | If you drop `prismarine-viewer` and use `bun:sqlite`/`vectra` (no node-gyp addons), Bun runs the whole process fine — crypto is solved. This is a clean path for a debug-UI-free build. |
| sqlite-vec | vectra | Bun runtime, or when you want a dependency-free pure-JS vector store and corpus is small (tens of thousands of vectors). |
| sqlite-vec | hnswlib-node / hnswsqlite | Larger semantic corpora needing HNSW ANN speed; adds a native addon (Node-only). Overkill for an MVP single agent. |
| @langchain/langgraph | Hand-rolled state machine | If LangGraph's abstraction feels heavy for a research project — but you lose built-in checkpointing/persistence and the cycle primitives map exactly to your spec, so keep it. |
| @langchain/openai → LM Studio | Ollama | Ollama is the main alternative local host; also OpenAI-compatible. Project already chose LM Studio (GUI, model management). Same `baseURL` swap if you migrate. |
| LangGraph SqliteSaver | Plain JSON files | Fine for the very first spike (write memory to `state.json`), but no concurrency safety and no query — graduate to SQLite early. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Bun as the **runtime** while using `prismarine-viewer` headless | Requires `node-canvas-webgl` (node-gyp NAPI addon) which Bun does not reliably load | Node runtime, or drop the viewer (it is debug-only, not in the cognitive loop) |
| `better-sqlite3` under the **Bun** runtime | Maintainers explicitly don't support Bun; ABI mismatch / recompilation pain | `bun:sqlite` (built-in, 3–6× faster) |
| `sqlite-vss` | Deprecated; superseded | `sqlite-vec` |
| Cloud LLM SDKs (Anthropic/OpenAI hosted) as v1 target | Out of scope per PROJECT.md; cost/rate-limits hostile to an always-on loop | LM Studio local via `@langchain/openai` baseURL (abstraction lets you add cloud later) |
| `prismarine-viewer` as a core dependency | Heavy native build (canvas/WebGL), pure observability, not required for perception (Mineflayer exposes blocks/entities directly) | Read world state from Mineflayer's `bot` object; add viewer later as opt-in debug tool only |
| Guessing LangGraph version from training data | 0.x track moves fast; APIs (annotations, checkpointers) changed across minors | Pin exact version, read the changelog before upgrading |

## Stack Patterns by Variant

**If you want a headless debug 3D view of the agent (`prismarine-viewer`):**
- Use **Node** as the runtime (node-canvas-webgl needs node-gyp/NAPI)
- Persistence via `better-sqlite3` + `sqlite-vec` (also Node-native — consistent ABI)
- This is the safest, most-tested combination.

**If you want zero native addons and Bun-everything:**
- Use **Bun** as the runtime (Minecraft crypto works since Bun 1.2.6)
- Drop `prismarine-viewer`
- Persistence via `bun:sqlite` (+ `sqlite-vec` loadable extension or `vectra` for vectors)
- Cleaner single-tool workflow, but you own the SQLite glue LangGraph's SqliteSaver would otherwise provide.

**Recommended default for this research/learning project:** **Node runtime + Bun package manager + sqlite-vec + LangGraph SqliteSaver**, viewer optional. Maximizes "it just works" with the ecosystem's tested path, which matches the project's clean-design / documentation-first priority.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| mineflayer@4.37.1 | minecraft-protocol@1.66.2 | Bundled; supports MC 1.8–1.21.11. Pin server MC version to this range. |
| mineflayer-pathfinder@2.4.5 | mineflayer@4.x | Standard pairing; collectblock/pvp sit on top of pathfinder. |
| @langchain/langgraph@0.4.x | @langchain/core@0.x | Shared peer; install together. langgraph-checkpoint-sqlite@1.0.3 tracks this. |
| @langchain/openai@0.x | LM Studio `/v1` | `configuration.baseURL` + dummy `apiKey`. `OpenAIEmbeddings` baseURL historically buggy — set via constructor and verify, or fall back to `OPENAI_BASE_URL` env var. MEDIUM |
| better-sqlite3@12.11.1 | Node 20/22 | Node-only ABI. Do NOT run under Bun. |
| bun:sqlite | Bun 1.2.x | Built-in; the Bun-runtime answer to better-sqlite3. |
| Bun 1.2.6+ | minecraft-protocol crypto | Diffie-Hellman/Cipheriv/ECDH rewritten and passing Node tests — Minecraft online-mode auth path works on Bun. HIGH |

## Sources

- npm registry (queried 2026-06-18) — exact `latest` versions for mineflayer 4.37.1, minecraft-protocol 1.66.2, mineflayer-pathfinder 2.4.5, mineflayer-collectblock 1.4.4, mineflayer-pvp 1.3.2, mineflayer-armor-manager 2.0.1, @langchain/langgraph 0.4.x, @langchain/openai, @langchain/core, @langchain/langgraph-checkpoint-sqlite 1.0.3, better-sqlite3 12.11.1, sqlite-vec 0.1.9, vectra 0.15.0, zod 4.4.3 — HIGH
- https://www.npmjs.com/package/mineflayer + https://github.com/PrismarineJS/mineflayer — version support range, Node ≥18 requirement — HIGH
- https://bun.sh/blog/bun-v1.1.45 , https://bun.sh/blog/bun-v1.2.1 , https://bun.sh/blog/bun-v1.2.6 — Bun crypto (diffieHellman, Cipheriv/Decipheriv, ECDH, randomBytes) now implemented — HIGH
- https://github.com/oven-sh/bun/issues/16050 + https://github.com/oven-sh/bun/issues/23136 — better-sqlite3 unsupported on Bun, `napi_register_module_v1` NAPI addon failures — HIGH
- https://bun.com/docs/runtime/sqlite — bun:sqlite built-in, 3–6× faster than better-sqlite3 — HIGH
- https://lmstudio.ai/docs/developer/openai-compat/embeddings + https://lmstudio.ai/docs/developer/core/server — OpenAI-compatible `/v1/chat/completions` and `/v1/embeddings` on localhost:1234, nomic-embed-text default — HIGH
- https://github.com/langchain-ai/langchainjs/issues/3086 — OpenAIEmbeddings baseURL configuration caveat (set via constructor / env) — MEDIUM
- https://www.npmjs.com/package/@langchain/langgraph-checkpoint-sqlite + https://langchain-ai.github.io/langgraphjs — SqliteSaver checkpointer API — HIGH
- https://github.com/PrismarineJS/prismarine-viewer (headless example + issues #243/#209/#128) — requires node-canvas-webgl native build — HIGH
- https://github.com/asg017/sqlite-vss + https://github.com/asg017/sqlite-vec — sqlite-vec supersedes deprecated sqlite-vss — HIGH

---
*Stack research for: autonomous persistent Minecraft agent (TS / Mineflayer / LangGraph.js / LM Studio)*
*Researched: 2026-06-18*
