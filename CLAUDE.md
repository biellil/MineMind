## Git Commit Guidelines

**MANDATORY**: All commits must follow the Conventional Commits specification with emojis.

### Commit Message Format

```
<emoji> <type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### Types with Emojis

| Emoji | Type | When to use |
|-------|------|-------------|
| ✨ | **feat** | A new feature |
| 🐛 | **fix** | A bug fix |
| 📝 | **docs** | Documentation only changes |
| 💄 | **style** | Code style/formatting (whitespace, semicolons, etc) |
| ♻️ | **refactor** | Code change that neither fixes a bug nor adds a feature |
| ⚡️ | **perf** | Performance improvements |
| ✅ | **test** | Adding or updating tests |
| 🔧 | **chore** | Changes to build process or auxiliary tools |
| 🏗️ | **build** | Changes that affect the build system or dependencies |
| 🤖 | **ci** | Changes to CI configuration files and scripts |
| ⏪️ | **revert** | Reverts a previous commit |
| 🔒️ | **security** | Security improvements or fixes |
| 🚀 | **deploy** | Deployment and release changes |
| 🎉 | **init** | Initial project setup |
| 🔥 | **remove** | Removing code, files, or features |
| 🚑️ | **hotfix** | Critical production fix |
| 🌐 | **i18n** | Internationalization and localization |
| ♿️ | **a11y** | Accessibility improvements |
| 🎨 | **ui** | UI/UX improvements |
| 📱 | **mobile** | Mobile-specific changes |
| 🗄️ | **database** | Database schema or migration changes |
| 📦 | **deps** | Dependency updates |
| ⬆️ | **deps-up** | Upgrade dependencies |
| ⬇️ | **deps-down** | Downgrade dependencies |
| 🐳 | **docker** | Docker-related changes |
| ☸️ | **k8s** | Kubernetes configuration changes |
| 🔀 | **merge** | Merge branches |
| 📈 | **analytics** | Analytics and tracking |
| 🚨 | **lint** | Fix lint warnings/errors |
| 🧹 | **cleanup** | Code cleanup and housekeeping |
| 🏷️ | **release** | Versioning and releases |
| 💚 | **healthcheck** | Fix CI/build health issues |
| 🎯 | **types** | Type definitions and typing improvements |
| 🔍 | **debug** | Add or improve debugging/logging |
| 🚧 | **wip** | Work in progress |
| 🧪 | **experiment** | Experimental features or prototypes |
| 📊 | **monitoring** | Monitoring, metrics, and observability |

### Examples

```bash
✨ feat(auth): add Google OAuth authentication

🐛 fix(api): prevent duplicate webhook processing

📝 docs(readme): add Docker setup instructions

♻️ refactor(database): simplify repository pattern

⚡️ perf(cache): reduce database queries using Redis

✅ test(users): add integration tests for user creation

🔧 chore(eslint): update linting configuration

🏗️ build(deps): upgrade NestJS to latest version

🤖 ci(github): add automated release workflow

⏪️ revert: revert payment gateway migration

🔒️ security(auth): validate JWT signature before processing

🚀 deploy: release version 2.5.0

🎉 init: bootstrap NestJS project structure

🔥 remove(legacy): delete deprecated authentication service

🚑️ hotfix(payments): fix production payment failure

🌐 i18n: add Portuguese translations

♿️ a11y(ui): improve keyboard navigation support

🎨 ui(dashboard): redesign statistics cards

🗄️ database: create users and roles tables

📦 deps: update express and mongoose

🐳 docker: optimize production image size

☸️ k8s: add readiness and liveness probes

🚨 lint: fix ESLint violations across project

🎯 types(user): improve UserDTO typing

🔍 debug(api): add request tracing logs

📊 monitoring: add Prometheus metrics endpoint

### Important Rules

**NEVER** include these lines in commits:
```
🤖 Generated with [Claude Code](https://claude.com/claude-code)
Co-Authored-By: Claude <noreply@anthropic.com>
```

<!-- GSD:project-start source:PROJECT.md -->
## Project

**MineMind**

MineMind é um agente autônomo persistente que vive dentro do Minecraft. Diferente de bots tradicionais orientados por comandos, ele possui objetivos próprios, memória de longo prazo, personalidade evolutiva e capacidade de tomar decisões independentes — uma entidade digital que existe continuamente em um mundo Minecraft, interagindo com jogadores e com o ambiente de forma natural. O projeto é uma exploração de pesquisa/aprendizado sobre arquiteturas de agentes, sistemas de memória e orquestração cognitiva.

**Core Value:** O agente permanece ativo de forma autônoma, percebe o mundo e age sobre ele com base em objetivos próprios e memória — sem intervenção humana. Se tudo mais falhar, o loop cognitivo (perceber → decidir → agir) precisa funcionar.

### Constraints

- **Tech stack**: TypeScript de ponta a ponta — Mineflayer + `@langchain/langgraph` (JS) no mesmo processo — porque Mineflayer é Node-only e queremos uma única linguagem.
- **Runtime**: Bun como runtime/gerenciador de pacotes (TS nativo, performático), com Node como fallback de compatibilidade caso o Mineflayer apresente casos-limite. A pesquisa deve validar a compatibilidade Bun↔Mineflayer.
- **LLM (v1)**: LM Studio (modelo local) — custo zero e adequado a um loop sempre-ativo; reasoning local é mais fraco que frontier cloud.
- **Plataforma de jogo**: Minecraft Java Edition em servidor local — Mineflayer não suporta Bedrock.
- **Foco do projeto**: pesquisa/aprendizado — priorizar design limpo e instrutivo sobre features impressionantes.
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## Executive Verdict (read this first)
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
### Development Tools
| Tool | Purpose | Notes |
|------|---------|-------|
| Bun | Install/scripts/test runner | `bun install`, `bun run`, `bun test`. Use even if Node is the runtime. |
| tsx (if on Node) | Run TS directly without a build step | `tsx watch src/index.ts` for dev loop; Bun runs TS natively so only needed on Node. |
| Paper / Spigot local server | Controlled test world | Pin server to a Mineflayer-supported MC version (e.g. 1.20.4 or 1.21.x). Offline-mode for no auth during dev. |
| LM Studio | Local model host | Enable the server in the Developer tab; load one chat model + one embedding model. |
## Installation
# Core (Bun as package manager)
# Persistence — Node runtime variant
# Persistence — Bun runtime variant (no native node-gyp addons)
# Optional / later phases
# Dev (Node runtime only — Bun runs TS natively)
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
- Use **Node** as the runtime (node-canvas-webgl needs node-gyp/NAPI)
- Persistence via `better-sqlite3` + `sqlite-vec` (also Node-native — consistent ABI)
- This is the safest, most-tested combination.
- Use **Bun** as the runtime (Minecraft crypto works since Bun 1.2.6)
- Drop `prismarine-viewer`
- Persistence via `bun:sqlite` (+ `sqlite-vec` loadable extension or `vectra` for vectors)
- Cleaner single-tool workflow, but you own the SQLite glue LangGraph's SqliteSaver would otherwise provide.
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
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd:quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd:debug` for investigation and bug fixing
- `/gsd:execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd:profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
