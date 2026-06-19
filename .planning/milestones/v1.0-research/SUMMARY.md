# Project Research Summary

**Project:** MineMind
**Domain:** Autonomous persistent Minecraft Java agent ("living NPC" / embodied LLM agent) — TypeScript, single-process, local LLM
**Researched:** 2026-06-18
**Confidence:** MEDIUM-HIGH

## Executive Summary

MineMind is an embodied LLM agent that *lives* inside a local Minecraft Java world: it perceives, decides, and acts on its own goals through a perpetual cognitive loop. The field (Voyager, Mindcraft, Project Sid/PIANO, Stanford Generative Agents) has converged on a **layered embodied-agent** shape — a low-level game-control layer, a high-level skills/action layer, an LLM reasoning layer, and a tiered memory store. MineMind's stated architecture (`Minecraft → Mineflayer → Action Layer → LangGraph → LLM → Memory`) is exactly this consensus shape; its distinctive contribution is making the cognitive loop an explicit **cyclic LangGraph `StateGraph`** rather than an ad-hoc `while` loop, and pursuing the "living being" axis (internal needs + multi-tier memory + per-player social profiles + evolving personality) that Voyager and Mindcraft do not.

The recommended approach is pragmatic and de-risks the two riskiest unknowns first. **Mineflayer plugins (`pathfinder`, `collectblock`) supply the entire action layer for free** — v1 effort belongs in the cognitive loop and memory, not in re-inventing navigation/mining. On runtime: **use Bun as package manager and Node ≥20 LTS as the agent runtime** by default (Bun's only real blockers are node-gyp NAPI addons like `better-sqlite3`; Minecraft crypto is already solved on Bun 1.2.6+). A clean Bun-everything path exists if you drop the debug-only `prismarine-viewer` and use `bun:sqlite`/`vectra` — but that decision must be settled by an early connect+play spike, not assumed. The single non-negotiable for v1 is that the **Observe → Decide → Act loop works**; the build order deliberately gets a *non-LLM closed loop* running (steps 1–4) before any LLM uncertainty enters.

The dominant risks are not stack incompatibilities — they are **loop-behavior failures under a weak local model**. The five that will sink an unguarded build: (1) ticking the loop at LLM speed (GPU thrash, stale plans) — must be a **two-rate, single-flight, event-driven** loop by design; (2) small local models emitting invalid JSON/tool calls — must use **constrained/grammar-enforced decoding + a closed action enum + Zod validate-repair-fallback**; (3) `mineflayer-pathfinder` hanging the whole loop — every action needs a **timeout + no-progress watchdog**; (4) goal oscillation/starvation — needs **commitment/hysteresis + loop detection + progress tracking + anti-starvation aging**; (5) unbounded memory stuffing the context window — needs a **hard prompt token budget + bounded short-term buffer** from the first LLM integration. None are exotic, but most must be designed in upfront, not retrofitted.

## Key Findings

### Recommended Stack

All-TypeScript, single-process. Mineflayer is Node-only, so it dictates the runtime story: **Node ≥20 LTS runtime + Bun as package manager/test runner** is the "it just works" default that matches the project's clean-design priority; a zero-native-addon Bun-everything build is viable if the viewer is dropped. The cognitive loop maps directly onto LangGraph.js (cycles + annotated shared state + checkpointing). LM Studio's OpenAI-compatible `/v1` endpoint is a drop-in via `@langchain/openai`. Detail in [STACK.md](./STACK.md).

**Core technologies:**
- **mineflayer 4.37.1** (+ `pathfinder` 2.4.5, `collectblock` 1.4.4): the game interface (perception + actuation) — de-facto Java bot standard; supplies the action layer for free.
- **@langchain/langgraph 0.4.x** (+ `@langchain/core`): cognitive-loop orchestration as a cyclic `StateGraph` — cycles + checkpointing map 1:1 to the Observe→…→Reflect spec.
- **@langchain/openai → LM Studio**: LLM + embeddings via `configuration.baseURL` — zero cost, no rate limits, ideal for an always-on loop.
- **Node 20/22 LTS runtime + Bun 1.2.x package manager**: honors "Bun-first, Node fallback" while sidestepping node-gyp NAPI addon incompatibilities.
- **zod 4.4.3**: structured-output schemas to constrain local-model JSON output (drifts without enforcement).
- **Persistence (deferred):** LangGraph `SqliteSaver` + `sqlite-vec` on Node, or `bun:sqlite`/`vectra` on Bun — pick by runtime; not an MVP concern.

### Expected Features

The action layer is mostly integration, not invention; v1 value is the loop + short-term memory. Detail in [FEATURES.md](./FEATURES.md).

**Must have (table stakes — without these it is a scripted bot, not an agent):**
- Connect & stay online (auto-reconnect) — the agent must *live*.
- Perceive world state (position, entities/blocks, inventory, health/time) — input to every decision.
- Basic cognitive loop in LangGraph (Observe → Analyze → Plan → Execute) — *this is the thesis*.
- Autonomous navigation (`pathfinder`) — visible autonomy.
- Read chat + respond coherently — primary intelligence signal.
- Short-term memory (sliding window of NL events) — prevents amnesia.
- LM Studio local LLM integration + static personality prompt — reasoning engine with a coherent voice.

**Should have (the "living agent" differentiators):**
- Internal needs system (survival/resources/shelter/curiosity/socialization) — intrinsic motivation, the "living NPC" hook.
- Dynamic goals (priority/progress/dependencies/internal reward) — self-directed agenda.
- Full cognitive state machine (Idle/Exploring/Gathering/Socializing; Fighting/Building stubbed).

**Defer (v2+):**
- Multi-tier memory persistence (long-term + semantic), Reflection, per-player social profiles, evolving personality — the open persistence question is resolved *here*, not now.
- Cloud LLM provider abstraction; Voyager-style skill acquisition (stretch).
- **Anti-features (deliberately do NOT build):** LLM-generated executable code (security/debugging nightmare), concurrent/parallel cognitive modules (PIANO coherence problem), multi-agent society, Bedrock support, combat/building as a v1 focus.

### Architecture Approach

A layered single-process design where the **`minecraft/` adapter is the only place that imports mineflayer** (anti-corruption boundary), `skills/` are testable independently of the LLM, and the LangGraph orchestrates but holds no game logic. The most important boundary is skills-vs-cognition: it lets a non-LLM closed loop run first. Detail in [ARCHITECTURE.md](./ARCHITECTURE.md).

**Major components:**
1. **Mineflayer Adapter** (`minecraft/`) — owns `bot` lifecycle, plugins, reconnect; translates raw events into clean domain types. Nothing above imports mineflayer.
2. **Perception** — produces an immutable `WorldSnapshot` on demand (read-only over the adapter).
3. **Action Layer / Skills** (`skills/`) — high-level parameterized skills (`goTo`, `collectBlock`, `say`…) as plain async functions *and* LangChain `tool()`s (Zod schema). LLM never touches raw mineflayer.
4. **Cognitive Graph** (`cognition/`) — the loop as a cyclic `StateGraph` over `Annotation.Root`; one node per step; `status`/needs/goals live as *state fields*, not graph topology.
5. **Memory** (`memory/`) — three tiers behind interfaces: short-term in graph state (capped), long-term SQLite, semantic vector store (deferred).
6. **LLM Client** (`llm/`) — provider-abstracted `ChatOpenAI` pointed at LM Studio so cloud can drop in later.

### Critical Pitfalls

Top 5 from [PITFALLS.md](./PITFALLS.md). The recurring theme: **weak-local-model loop behavior must be engineered upfront.**

1. **Think-every-tick at LLM speed** — local inference is 3–30s/decision; freezing or overlapping calls thrash the GPU. → **Two-rate architecture** (cheap reactive layer + LLM-on-trigger), **single-flight** the LLM (`isThinking` mutex), event-driven re-planning. Must be a design decision *before* writing the loop.
2. **Small models emit invalid JSON / hallucinated actions** — 5%/step compounds to ~60% over 10 steps. → **Constrained/grammar decoding (not prompting)**, closed action `enum`, Zod validate → one repair → safe-default fallback, single-next-action over multi-step plans.
3. **Pathfinder hangs the whole loop** — several failure modes neither resolve nor reject. → **Timeout + watchdog on every action** (`Promise.race` + `stop()`), no-progress detector, treat physical failure as normal feedback. Mandatory before shipping movement.
4. **Goal oscillation / need starvation** — greedy re-evaluation flips the winner every tick; motion without progress. → **Commitment/hysteresis**, action-hash loop detection, per-goal progress watchdog, anti-starvation aging, re-plan budget.
5. **Unbounded memory → context stuffing → reasoning collapse** — LM Studio crashes/truncates/emits garbage on overflow. → **Hard prompt token budget**, bounded ring buffer + summarize-and-evict, defer vector store to Fase 4. Budget must exist from the first LLM integration.

Also load-bearing: **no reconnect supervisor** (Fase 1 — fresh `bot` on disconnect, never reuse), **Bun↔Mineflayer edge cases** (Fase 1 spike), **anti-cheat from superhuman speed** (Fase 2 pacing layer), **physics/timing races on stale snapshots** (Fase 2 precondition re-checks).

## Implications for Roadmap

Based on combined research, suggested phase structure. The research aligns on a **4-phase MVP** (already reflected in PROJECT.md), and architecture's build order strongly recommends an **LLM-free closed loop running before the LLM enters**. Strongest single recommendation: keep the deliberate non-LLM milestone (architecture build steps 1–4) as the spine of Fase 1→2.

### Phase 1: Presence & Connection (LLM-free foundation)
**Rationale:** The core value is *staying alive autonomously*; the riskiest external unknowns (mineflayer behavior, Bun runtime compatibility) must be proven before anything is built on top. Architecture build steps 1–3 land here.
**Delivers:** Mineflayer adapter (the only mineflayer-importing code) with connect + auto-reconnect supervisor; a few hand-tested raw skills (`goTo`, `say`, `collectBlock`); a clean `WorldSnapshot` perception function.
**Addresses (FEATURES):** Connect & stay online; perceive world state; autonomous navigation.
**Avoids (PITFALLS):** #6 reconnect/crash recovery (supervisor + fresh bot), #8 Bun↔Mineflayer edge cases (early connect+play+reconnect spike on the target MC version — *gate the runtime decision here*), #3 pathfinder hang (timeout/watchdog wrapper introduced with the first movement skill).

### Phase 2: Autonomous Loop & Short-Term Memory (still de-riskable without LLM)
**Rationale:** Architecture build step 4 — a closed `StateGraph` loop with stubbed/hardcoded-rule nodes proves the core architecture with zero LLM uncertainty. Short-term memory and the action-execution discipline (pacing, precondition checks) belong here because they guard the loop the moment it starts acting continuously.
**Delivers:** Cyclic LangGraph `StateGraph` with loop-back edge; non-LLM rule-based wandering/idle; bounded short-term ring buffer; centralized action-execution layer with rate limiting.
**Uses (STACK):** `@langchain/langgraph` (`Annotation.Root`, `addConditionalEdges`), mineflayer-pathfinder.
**Implements (ARCHITECTURE):** Cognitive Graph + skills-as-tools boundary; short-term memory in `AgentState`.
**Avoids (PITFALLS):** #7 anti-cheat pacing, #9 physics/timing races (precondition re-checks), #3 watchdog reinforced, #5 token-budget skeleton + bounded buffer (before the LLM arrives).

### Phase 3: LLM Cognition — Full Loop, Needs & Goals
**Rationale:** With a proven loop, layer in the LM Studio LLM, chat, and the intrinsic-motivation system (needs → dynamic goals → state selection). This is where the project's defensible identity begins and where the most dangerous pitfalls concentrate.
**Delivers:** `ChatOpenAI` → LM Studio wiring; LLM-driven `analyze`/`plan`/`reflect`; coherent chat replies; needs decay model; dynamic goal queue scored by needs; full cognitive state machine (Fighting/Building stubbed); reconnect supervisor hardened with state-outside-bot.
**Uses (STACK):** `@langchain/openai`, `zod`, LM Studio structured-output/grammar enforcement, `nomic-embed-text` (only if early semantic recall is needed).
**Avoids (PITFALLS):** #1 think-every-tick (two-rate + single-flight + event-driven — *design before coding*), #2 invalid JSON (constrained decoding + closed enum + repair/fallback), #4 goal oscillation/starvation (commitment/hysteresis + loop detection + progress watchdog + aging + re-plan budget), #5 context budget enforced for real.

### Phase 4: Persistence, Reflection & Living Identity
**Rationale:** Deferred until short-term memory's limits are *felt* and the open persistence question can be answered with evidence. Reflection requires a persisted memory stream; per-player profiles require long-term storage; evolving personality is the emergent product of both — they correctly land together, last.
**Delivers:** Multi-tier memory persistence (resolve SQLite vs JSON vs vector store *here*); LangGraph checkpointer for restart-survival; semantic recall with embeddings; Reflecting state (synthesize beliefs); per-player social profiles; evolving personality from a static prompt baseline.
**Uses (STACK):** LangGraph `SqliteSaver` + `sqlite-vec` (Node) or `bun:sqlite`/`vectra` (Bun); `OpenAIEmbeddings` via LM Studio.
**Avoids (PITFALLS):** #5 memory bloat (dedup/decay/consolidate, recency+relevance retrieval), #6 state-persists-across-restart.

### Phase Ordering Rationale

- **LLM-free spine first (Fase 1–2):** the two riskiest unknowns are mineflayer behavior and weak-local-LLM reasoning. Architecture's build order isolates both — a closed autonomous loop runs before any LLM dependency, so neither blocks proving the core architecture.
- **Dependency-driven grouping:** the cognitive loop *requires* short-term memory (each tick needs context → Fase 2 with the loop). Dynamic goals *require* the needs system (nothing to prioritize against otherwise → both Fase 3). Reflection/profiles/personality *require* long-term memory (→ all Fase 4 together).
- **Pitfall-driven sequencing:** the guards must precede what they guard — reconnect supervisor with first connect (Fase 1), action watchdog/pacing with first movement (Fase 1–2), token budget before the first LLM call (Fase 2 skeleton → Fase 3 enforced), loop-detection/commitment as first-class loop components when goals arrive (Fase 3).
- **Persistence deferred deliberately:** the open research question (SQLite/JSON/vector) is answered with evidence in Fase 4, avoiding premature infra before short-term memory is proven.

### Research Flags

Phases likely needing deeper research during planning (`/gsd:research-phase`):
- **Fase 3:** Highest-risk integration. LM Studio structured-output / grammar (GBNF) enforcement and tool-calling support of the chosen local model are model-specific and version-sensitive; the two-rate-loop + single-flight design and the goal-oscillation control strategy warrant focused design research before coding.
- **Fase 4:** The persistence strategy is an explicitly *open* question (SQLite vs JSON vs vector store) and the runtime choice (Node `sqlite-vec`+`SqliteSaver` vs Bun `bun:sqlite`/`vectra`) gates it. Generative-Agents retrieval scoring (recency × relevance × importance) and memory curation/decay need concrete design.

Phases with standard patterns (likely skip research-phase):
- **Fase 1:** Mineflayer connect/reconnect/pathfinder and the adapter pattern are well-documented; the only unknown (Bun compatibility) is resolved by a build spike, not desk research.
- **Fase 2:** LangGraph `StateGraph` cyclic-loop API is verified; rule-based nodes + bounded buffer are standard.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Versions verified against npm registry (2026-06-18); Bun crypto fix and node-gyp/NAPI blockers cross-referenced with Bun release notes and PrismarineJS. LangGraph 0.x patch moves fast (pin exactly). |
| Features | HIGH | Prior art well-documented (Voyager, Mindcraft, Project Sid/PIANO, Stanford Generative Agents); mineflayer plugin ecosystem verified. Framed against research prior art, not a commercial market. |
| Architecture | MEDIUM-HIGH | LangGraph.js API verified against official reference + DeepWiki; agent-design patterns drawn from the two dominant precedents (Voyager, Mindcraft). README PRD stub absent — grounded in PROJECT.md + external precedent. |
| Pitfalls | MEDIUM-HIGH | Mineflayer/LangGraph/local-LLM pitfalls verified against project issue trackers + multiple post-mortems. Bun↔Mineflayer status is fast-moving (MEDIUM); local-model JSON reliability well-evidenced. |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address

- **Bun↔Mineflayer compatibility (MEDIUM):** Single anecdotal report of mineflayer 4.29.0 on Bun 1.2.x; `socketClosed`/NBT/protodef edge cases possible. → Resolve with a Fase 1 connect+walk+dig+reconnect spike on the *exact* target MC version. Keep Node fallback trivial by avoiding Bun-only APIs in core. Treat the runtime decision as reversible until the spike passes.
- **Long-term/semantic persistence strategy (OPEN per PROJECT.md):** SQLite vs JSON vs vector store unresolved by design. → Defer to Fase 4 and decide with evidence once short-term memory's limits are felt; stack research pre-scopes the options per runtime.
- **LM Studio structured-output & tool-calling support of the chosen model (MEDIUM):** Grammar enforcement and whether the loaded local model supports tool/function calling are model-specific. → Verify during Fase 3 planning; fall back to JSON-schema-from-text parsing if tool-calling is unsupported.
- **`OpenAIEmbeddings` baseURL caveat (MEDIUM):** Historically buggy; set via constructor and verify, or fall back to `OPENAI_BASE_URL` env var. → Validate when semantic memory is wired (Fase 4).
- **LangGraph 0.x version churn (MEDIUM):** APIs (annotations, checkpointers) have changed across minors. → Pin exact versions; read the changelog before bumping.

## Sources

### Primary (HIGH confidence)
- npm registry (queried 2026-06-18) — exact versions for mineflayer 4.37.1, minecraft-protocol 1.66.2, pathfinder 2.4.5, collectblock 1.4.4, @langchain/langgraph 0.4.x, better-sqlite3, sqlite-vec 0.1.9, vectra 0.15.0, zod 4.4.3.
- mineflayer + PrismarineJS docs/repos — version support range, Node ≥18, pathfinder/collectblock APIs.
- Bun release notes (v1.1.45 / v1.2.1 / v1.2.6) + Bun SQLite docs — crypto fix; `bun:sqlite` built-in; better-sqlite3 unsupported on Bun (NAPI failures, issues #16050 / #23136).
- LM Studio docs — OpenAI-compatible `/v1/chat/completions` + `/v1/embeddings`, overflow policies.
- LangGraph.js — StateGraph/Annotation.Root/addConditionalEdges/checkpointers (DeepWiki + official API reference).
- Voyager (arXiv 2305.16291), Stanford Generative Agents (arXiv 2304.03442), Project Sid/PIANO (arXiv 2411.00114) — agent architectures, memory/retrieval, coherence warnings.
- mineflayer-pathfinder issue tracker (#222/#273/#332/PR#90) + mineflayer (#3887/#623/#2778/#1091) — documented hangs, reconnect, anti-cheat.
- LM Studio bug tracker (#1620/#1806) — context-overflow crash/silent-truncation/garbage output.

### Secondary (MEDIUM confidence)
- Mindcraft (github.com/mindcraft-bots/mindcraft, arXiv 2504.17950) — production mineflayer+LLM framework; local-LLM (Ollama) viability; memory-as-JSON, profiles.
- Structured-output post-mortems (Tensoria, Markaicode) — compounding per-step JSON failure; grammar-constrained decoding.
- Agent-loop post-mortems (Modexa, BSWEN, browser-use #191) — oscillation, re-planning loops, action-hash detection.
- LangGraph.js #1524 — recursionLimit / termination conditions.
- @langchain/openai #3086 — OpenAIEmbeddings baseURL caveat.

### Tertiary (LOW confidence — needs validation)
- Bun + mineflayer 4.29.0 on Bun 1.2.15 (June 2025) — single anecdotal report; validate via Fase 1 spike.

---
*Research completed: 2026-06-18*
*Ready for roadmap: yes*
