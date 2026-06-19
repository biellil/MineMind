# Architecture Research

**Domain:** Autonomous persistent Minecraft agent (TypeScript, Mineflayer + LangGraph.js, local LLM)
**Researched:** 2026-06-18
**Confidence:** MEDIUM-HIGH (LangGraph.js API verified against official reference + DeepWiki; agent-design patterns drawn from Voyager and Mindcraft, the two dominant precedents)

> Note: `README.md` is currently a 2-line stub — the detailed PRD referenced in the milestone context is not present in the repo. This research is grounded in `.planning/PROJECT.md` plus external precedents. The 7-state machine and needs/goals/memory systems are treated as the design target from PROJECT.md.

## Standard Architecture

The field has converged on a **layered embodied-agent** shape. Voyager and Mindcraft (the two reference implementations for LLM + Mineflayer) both separate a low-level game-control layer, a high-level "skills/actions" layer, an LLM reasoning layer, and a memory/skill store. MineMind's intended `Minecraft → Mineflayer → Action Layer → LangGraph → LLM → Memory` is exactly this shape; the contribution this project adds is making the cognitive loop an explicit **cyclic LangGraph** rather than an ad-hoc `while` loop.

### System Overview

```
┌───────────────────────────────────────────────────────────────────┐
│                       PROCESS (single Bun/Node process)             │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │              COGNITIVE GRAPH  (@langchain/langgraph)          │   │
│  │   observe → analyze → updateMemory → evaluateNeeds →          │   │
│  │   generateGoals → plan → execute → reflect ─┐                 │   │
│  │      ▲                                       │ (loop edge)    │   │
│  │      └───────────────────────────────────────┘                │   │
│  │   state: AgentState (status, needs, goals, plan, memory refs) │   │
│  └───┬─────────────────┬──────────────────┬─────────────────────┘   │
│      │ reads world      │ calls skills      │ reads/writes           │
│      │ (perception)     │ (tools)           │ (memory tiers)         │
│  ┌───▼──────────┐  ┌────▼─────────┐  ┌──────▼───────────────────┐    │
│  │  PERCEPTION  │  │ ACTION LAYER │  │       MEMORY              │    │
│  │  (snapshot   │  │ (skills as   │  │  short-term (in-state)    │    │
│  │   of bot)    │  │  typed tools)│  │  long-term  (SQLite)      │    │
│  └───┬──────────┘  └────┬─────────┘  │  semantic   (vector/embed)│    │
│      │                  │            └──────────────────────────┘     │
│  ┌───▼──────────────────▼─────────────────────────────────────┐      │
│  │           MINEFLAYER ADAPTER (anti-corruption layer)         │      │
│  │  wraps `bot`, pathfinder, collectblock, tool, pvp plugins    │      │
│  └───┬─────────────────────────────────────────────────────────┘      │
│      │ protocol                                                        │
│  ┌───▼──────────┐                  ┌──────────────────────────────┐    │
│  │  mineflayer  │                  │  LLM CLIENT (LM Studio,       │    │
│  │  (prismarine)│                  │  OpenAI-compatible /v1)       │    │
│  └───┬──────────┘                  └──────────────────────────────┘    │
└──────┼─────────────────────────────────────────────────────────────┘
       │ TCP (Minecraft protocol)
┌──────▼───────────────────┐
│  Minecraft Java Server   │  (local, dev)
└──────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| **Mineflayer Adapter** | Own the `bot` instance, plugin loading, connection lifecycle, reconnect. Translate raw mineflayer events/state into clean domain types. Nothing above it imports `mineflayer` directly. | A `MinecraftClient` class wrapping `createBot()` + `bot.loadPlugin(pathfinder/collectblock/tool/pvp)`; exposes typed methods + an event emitter. |
| **Perception** | Produce an immutable `WorldSnapshot` (health, food, position, time, nearby entities/blocks, inventory, recent chat) on demand. Read-only over the adapter. | A `perceive(adapter): WorldSnapshot` function. Pure, cheap, called by the `observe` node. |
| **Action Layer (Skills)** | High-level, parameterized, self-contained skills (`goTo`, `collectBlock`, `craft`, `placeBlock`, `attack`, `say`). Each returns a structured `SkillResult {ok, error?, observation}`. This is where mineflayer boilerplate is hidden. | Async functions/classes; also exported as LangChain `tool()` definitions (Zod schema) so the LLM can call them. |
| **Cognitive Graph** | The 9-step loop as a `StateGraph`. Owns ordering, branching (state machine), and the loop-back edge. Holds no game logic — it orchestrates the other layers. | `@langchain/langgraph` `StateGraph` over an `Annotation.Root` state. One node per cognitive step. |
| **LLM Client** | Provider-abstracted chat/completion + (optionally) embeddings. v1 target = LM Studio. | `@langchain/openai` `ChatOpenAI` pointed at `http://localhost:1234/v1` (LM Studio is OpenAI-compatible). Abstraction interface so cloud can drop in later. |
| **Memory** | Three tiers. Short-term = recent events held in graph state. Long-term = durable episodic facts (SQLite). Semantic = embeddings for similarity recall (skills, places, people). | SQLite (`better-sqlite3` / `bun:sqlite`) for long-term; a vector store (sqlite-vec, or LanceDB/Chroma) for semantic. Short-term lives in `AgentState`. |
| **Social profiles** | Per-player relationship/reputation records. | A typed table in the long-term store, keyed by username. (Phase 4 in PROJECT.md.) |

## Recommended Project Structure

```
src/
├── index.ts                  # bootstrap: build adapter, compile graph, start loop
├── minecraft/                # Mineflayer adapter — ONLY place that imports mineflayer
│   ├── client.ts             # MinecraftClient: createBot, plugins, reconnect
│   ├── events.ts             # raw mineflayer events → typed domain events
│   └── types.ts              # WorldSnapshot, Entity, BlockInfo, ChatEvent
├── perception/
│   └── perceive.ts           # adapter → WorldSnapshot (read-only)
├── skills/                   # Action Layer
│   ├── movement.ts           # goTo, follow, wander (pathfinder)
│   ├── gather.ts             # collectBlock, mine (collectblock + tool)
│   ├── build.ts              # placeBlock, craft
│   ├── combat.ts             # attack, flee (pvp)
│   ├── social.ts             # say, whisper
│   ├── registry.ts           # name → skill; exports LangChain tools (Zod schemas)
│   └── result.ts             # SkillResult type
├── cognition/                # The LangGraph
│   ├── state.ts              # AgentState Annotation.Root (status, needs, goals, plan…)
│   ├── graph.ts              # StateGraph wiring (nodes, edges, loop, compile)
│   ├── nodes/
│   │   ├── observe.ts
│   │   ├── analyze.ts
│   │   ├── updateMemory.ts
│   │   ├── evaluateNeeds.ts
│   │   ├── generateGoals.ts
│   │   ├── plan.ts
│   │   ├── execute.ts
│   │   └── reflect.ts
│   ├── states.ts             # CognitiveState enum + transition rules
│   ├── needs.ts              # needs model + decay/satisfaction logic
│   └── goals.ts              # Goal type, priority/progress/dependency logic
├── memory/
│   ├── shortTerm.ts          # ring buffer helpers (operates on AgentState)
│   ├── longTerm.ts           # SQLite episodic store
│   ├── semantic.ts           # vector store + embeddings
│   └── social.ts             # per-player profiles
├── llm/
│   ├── client.ts             # provider-abstracted ChatModel factory
│   └── prompts.ts            # system prompts per node (analyze, plan, reflect…)
└── config.ts                 # server host/port, LM Studio URL, loop tick, model name
```

### Structure Rationale

- **`minecraft/` as an anti-corruption layer:** mineflayer's API surface is large, event-driven, and version-sensitive. Isolating it behind typed methods means a mineflayer breaking change (or a Bun incompatibility forcing a workaround) touches one folder. Everything above depends on *your* types, not prismarine's.
- **`skills/` separate from `cognition/`:** skills must be testable and runnable without the LLM or graph (you can call `goTo(...)` from a script). The graph only *orchestrates* skills. This is the single most important boundary — it's what lets you get a non-LLM closed loop running first.
- **`cognition/nodes/` one file per step:** the 9 loop steps map 1:1 to graph nodes. Keeping them as small pure-ish functions `(state) => Partial<state>` makes the graph readable and each step independently testable.
- **`memory/` by tier:** the persistence decision (the open question in PROJECT.md) is contained here behind interfaces, so you can start with short-term only and add SQLite/vector later without touching the graph.

## Architectural Patterns

### Pattern 1: Cognitive loop as a cyclic StateGraph

**What:** Model the 9-step loop as graph nodes with a conditional edge from `reflect` back to `observe`. LangGraph natively supports cycles — a conditional edge can return the name of an earlier node, and the runtime re-enters it.
**When to use:** Always, for this project — it's the core value ("if all else fails, the loop must work").
**Trade-offs:** (+) explicit, inspectable, checkpointable, easy to insert/skip steps via conditional edges. (−) more ceremony than a `while(true)` loop; you must guard against runaway recursion (set `recursionLimit` high or use an external tick).

**Example (verified API — `Annotation.Root`, `StateGraph`, `addConditionalEdges`):**
```typescript
import { Annotation, StateGraph, START, END } from "@langchain/langgraph";

const AgentState = Annotation.Root({
  status: Annotation<CognitiveState>({ default: () => "Idle", value: (_, y) => y }),
  snapshot: Annotation<WorldSnapshot | null>({ default: () => null, value: (_, y) => y }),
  needs: Annotation<Needs>({ default: () => defaultNeeds(), value: (x, y) => ({ ...x, ...y }) }),
  goals: Annotation<Goal[]>({ default: () => [], value: (_, y) => y }),       // replace
  plan: Annotation<PlanStep[]>({ default: () => [], value: (_, y) => y }),
  shortTerm: Annotation<Event[]>({                                            // append + cap
    default: () => [],
    value: (x, y) => [...x, ...y].slice(-50),
  }),
  ticks: Annotation<number>({ default: () => 0, value: (x, y) => (y ?? x) }),
});

const graph = new StateGraph(AgentState)
  .addNode("observe", observe)
  .addNode("analyze", analyze)
  .addNode("updateMemory", updateMemory)
  .addNode("evaluateNeeds", evaluateNeeds)
  .addNode("generateGoals", generateGoals)
  .addNode("plan", planNode)
  .addNode("execute", execute)
  .addNode("reflect", reflect)
  .addEdge(START, "observe")
  .addEdge("observe", "analyze")
  .addEdge("analyze", "updateMemory")
  .addEdge("updateMemory", "evaluateNeeds")
  .addEdge("evaluateNeeds", "generateGoals")
  .addEdge("generateGoals", "plan")
  .addEdge("plan", "execute")
  .addEdge("execute", "reflect")
  .addConditionalEdges("reflect", (s) => (s.shouldStop ? END : "observe"));

const app = graph.compile({ checkpointer });
```

### Pattern 2: State machine + needs + goals modeled as graph *state*, not graph *topology*

**What:** Do **not** create one graph node per cognitive state (Idle/Exploring/Gathering/…). Instead keep `status: CognitiveState` as a *field* in `AgentState`. The `plan`/`execute` nodes branch on `status` internally (or via conditional edges) to choose which skills to run. State transitions are computed in `evaluateNeeds`/`generateGoals` and written back into `status`.
**When to use:** When the same loop steps apply regardless of mode — which is true here (you always observe→analyze→…→reflect; what changes is *which* skills execute).
**Trade-offs:** (+) keeps the graph small (8-9 nodes, not 8×7); state machine becomes data you can log and test in isolation. (−) the state→skill mapping lives in code, so it's less visually obvious from the graph diagram alone.

**Example (transition + needs-driven goal):**
```typescript
// states.ts — transitions are pure data
function nextState(needs: Needs, goals: Goal[]): CognitiveState {
  if (needs.survival < 0.3) return "Fighting";   // or fleeing
  if (needs.resources < 0.4) return "Gathering";
  if (topGoal(goals)?.kind === "build") return "Building";
  if (needs.socialization < 0.5 && playersNearby) return "Socializing";
  if (needs.curiosity > 0.7) return "Exploring";
  return "Idle";
}

// needs.ts — needs decay each tick, skills satisfy them
const defaultNeeds = (): Needs => ({ survival: 1, resources: 1, shelter: 1, curiosity: .5, socialization: .5 });
function decay(n: Needs): Needs { /* lower curiosity/social over time, survival from health */ }
```

### Pattern 3: Skills as typed tools (dual interface)

**What:** Each skill is (a) a plain async function `goTo(adapter, args): Promise<SkillResult>` and (b) wrapped as a LangChain `tool()` with a Zod schema. The `execute` node runs skills directly when following a deterministic plan; the `plan`/`analyze` nodes can hand the tool list to the LLM for tool-calling when reasoning is needed.
**When to use:** Always. The dual interface is what lets the loop run deterministically (no LLM) *and* be LLM-driven later.
**Trade-offs:** (+) LLM never touches raw mineflayer; failures are structured (`SkillResult.error`) and can be fed back into `reflect` (Voyager's "environment feedback" loop). (−) requires discipline keeping the Zod schema and function signature in sync.

**Example:**
```typescript
import { tool } from "@langchain/core/tools";
import { z } from "zod";

export async function goTo(adapter: MinecraftClient, x: number, y: number, z: number): Promise<SkillResult> {
  try { await adapter.pathfindTo(x, y, z); return { ok: true, observation: `arrived at ${x},${y},${z}` }; }
  catch (e) { return { ok: false, error: String(e), observation: "pathfinding failed" }; }
}

export const goToTool = tool(
  async ({ x, y, z }) => JSON.stringify(await goTo(adapter, x, y, z)),
  { name: "go_to", description: "Walk to a coordinate", schema: z.object({ x: z.number(), y: z.number(), z: z.number() }) }
);
```

## Data Flow

### Cognitive loop flow (one tick)

```
observe       : adapter → perceive() → WorldSnapshot          → state.snapshot
analyze       : snapshot (+ LLM) → salient events/intent       → state (intent, parsed chat)
updateMemory  : events → shortTerm (cap N) + longTerm (SQLite) + semantic (embed)
evaluateNeeds : snapshot + decay → updated Needs               → state.needs, state.status
generateGoals : needs + memory + LLM → ranked Goal[]           → state.goals
plan          : top goal + status → PlanStep[] (skills+args)   → state.plan
execute       : run plan steps via skills → SkillResult[]      → state.shortTerm (results)
reflect       : results + LLM → lessons, goal progress, stop?  → state.goals, memory, status
                └── conditional edge → observe (loop) or END
```

### State management

```
AgentState (Annotation.Root channels)
   ▲ writes (Partial<State> returned by each node, merged via channel reducers)
   │
[nodes] read full state, return only the channels they change
   │
[checkpointer] persists state per thread_id after every super-step
```

Each node is `(state) => Partial<state>`. Reducers decide merge semantics per channel: `shortTerm` appends-and-caps, `goals`/`plan`/`snapshot` replace, `needs` shallow-merges. This is the idiomatic LangGraph.js pattern (verified).

### Key data flows

1. **Perception → cognition:** read-only snapshot each tick; the graph never mutates the world during `observe`. Keeps reasoning deterministic w.r.t. a frozen view.
2. **Skill feedback → reflection:** `SkillResult.error` from `execute` flows into `reflect`, which can demote a goal or store a "this didn't work" lesson — the core self-improvement loop from Voyager.
3. **Memory recall → goal/plan:** `generateGoals` and `plan` query semantic memory (similar past situations / known skills) to inform the LLM prompt — embodied RAG, as in Mindcraft.
4. **Persistence across restarts:** LangGraph checkpointer + SQLite long-term store let the agent resume identity/goals after a process restart (matches "persistent entity" goal).

## Suggested Build Order

Dependency-driven; each step yields something runnable.

1. **Adapter + connection (no AI).** `minecraft/client.ts`: connect to local Java server, load pathfinder/collectblock/tool, stay online, auto-reconnect. *Milestone: bot appears in-world and survives.*
2. **A few raw skills, tested by hand.** `goTo`, `say`, `collectBlock`. Call them from a throwaway script. *Milestone: bot walks to coords and mines a block on command.* (Validates the hardest external dependency — mineflayer behavior — before any graph exists.)
3. **Perception snapshot.** `perceive()` returning health/pos/inventory/nearby/chat. *Milestone: print a clean WorldSnapshot each second.*
4. **Minimal closed loop, no LLM.** Build the `StateGraph` with stub nodes; `evaluateNeeds`/`plan` use hardcoded rules (e.g. "if curiosity high → wander"). Loop-back edge. *Milestone: the agent autonomously wanders/idles forever — the core value de-risked without LLM uncertainty.*
5. **LLM client (LM Studio) + chat.** Wire `ChatOpenAI` to `localhost:1234/v1`; make `analyze` read chat and `execute` reply via `say`. *Milestone: agent answers players coherently.*
6. **Short-term memory in state + needs/goals real logic.** Replace stubs with decay model and LLM-generated goals. *Milestone: agent's behavior shifts with its needs.*
7. **Persistence: LangGraph checkpointer + SQLite long-term.** Survive restarts. *Milestone: agent remembers across reconnects.*
8. **Semantic memory + reflection.** Embeddings store; `reflect` writes lessons and retrieves them. (Phase 4 territory.)
9. **Social profiles, richer skills (build/combat).**

> The critical insight: **steps 1-4 give a working autonomous loop with zero LLM dependency.** That isolates the two riskiest unknowns (mineflayer behavior, and weak local-LLM reasoning) so neither blocks proving the core architecture.

## Anti-Patterns

### Anti-Pattern 1: One graph node per cognitive state
**What people do:** Create `Idle`, `Exploring`, `Gathering`… nodes and route between them as the whole graph.
**Why it's wrong:** Conflates *what the agent is doing* (mode) with *the reasoning loop* (always observe→…→reflect). You get a combinatorial mess and lose the clean tick loop.
**Do this instead:** Keep `status` as a state field; one loop, branch on status inside `plan`/`execute`.

### Anti-Pattern 2: Letting the LLM call mineflayer directly
**What people do:** Expose `bot` or raw prismarine calls to the model.
**Why it's wrong:** Local LLMs produce buggy low-level code; mineflayer errors are cryptic; you lose structured failure feedback. (Mindcraft explicitly built a high-level skill library to avoid exactly this.)
**Do this instead:** LLM only sees typed skill tools with Zod schemas; skills return `SkillResult` with structured errors.

### Anti-Pattern 3: Unbounded short-term memory in state
**What people do:** Append every event to a state array forever.
**Why it's wrong:** State grows unbounded; checkpoint size and LLM context explode in an always-on loop.
**Do this instead:** Cap short-term via the channel reducer (`slice(-N)`); flush important events to long-term SQLite.

### Anti-Pattern 4: Synchronous tight loop with no tick/yield
**What people do:** `reflect → observe` with no delay; the graph spins as fast as the CPU allows.
**Why it's wrong:** Hammers the LLM and the server, and a low `recursionLimit` will abort the run.
**Do this instead:** Insert a small delay/await in `observe` (or drive each tick externally and call `app.invoke` per tick with a checkpointer for continuity). Set a generous `recursionLimit` for in-graph looping.

### Anti-Pattern 5: Importing mineflayer types above the adapter
**What people do:** Use prismarine `Entity`/`Block` types throughout cognition.
**Why it's wrong:** Couples the whole codebase to a fast-moving, version-sensitive API and complicates a possible Bun-driven rewrite of the adapter.
**Do this instead:** Define your own `Entity`/`BlockInfo`/`WorldSnapshot` in `minecraft/types.ts`; map at the boundary.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Minecraft Java server | mineflayer `createBot({ host, port, auth: 'offline' })` over TCP | Local dev server; pin a Minecraft version mineflayer supports (mineflayer is actively updated, e.g. 26.x line tracking 1.21.x). Offline-mode auth for local. |
| LM Studio | OpenAI-compatible HTTP at `http://localhost:1234/v1` via `@langchain/openai` `ChatOpenAI` | Set `configuration.baseURL`, dummy `apiKey`. Confirm the loaded model supports tool/function calling if you want LLM tool calls; otherwise parse JSON from text. Embeddings may need a separate embedding model loaded. |
| Vector store (semantic memory) | Library call (sqlite-vec extension, LanceDB, or Chroma) | Decision deferred (PROJECT.md open question). sqlite-vec keeps it single-store with long-term SQLite; LanceDB/Chroma are richer but add a dependency. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| cognition ↔ skills | direct async calls + LangChain tool wrappers | Graph orchestrates; never embeds mineflayer logic. |
| skills ↔ adapter | direct method calls on `MinecraftClient` | Only skills (and perception) touch the adapter. |
| adapter ↔ mineflayer | the only `import mineflayer` site | Anti-corruption layer; reconnect/lifecycle owned here. |
| cognition ↔ memory | interface calls (`longTerm.save`, `semantic.recall`) | Tiers behind interfaces so persistence backend can change. |
| nodes ↔ state | `(state) => Partial<state>` + channel reducers | Idiomatic LangGraph; no shared mutable globals. |

### Runtime note (Bun vs Node)

PROJECT.md targets Bun with Node fallback. Evidence (June 2025) shows mineflayer 4.29.0 running on Bun 1.2.x, so it is viable, but mineflayer is officially tested on Node and the prismarine stack has native/NBT edge cases. **Recommendation:** keep the adapter the *only* mineflayer-touching code so that if a Bun↔prismarine incompatibility surfaces, the fix is localized — and validate the Bun+mineflayer connection in **build step 1** before committing to it. (This is the right place to spend a small early spike.)

## Sources

- LangGraph.js StateGraph / Annotation.Root / addConditionalEdges / checkpointers — [DeepWiki: StateGraph and Graph Building](https://deepwiki.com/langchain-ai/langgraphjs/2.1-stategraph-and-graph-building) (HIGH), cross-checked with [LangGraph.js API reference](https://langchain-ai.github.io/langgraphjs/) (HIGH)
- Voyager architecture (skill library, iterative prompting, env-feedback loop) — [Voyager site](https://voyager.minedojo.org/) and [arXiv:2305.16291](https://arxiv.org/abs/2305.16291) (HIGH)
- Mindcraft architecture (server, agent loop, high-level action/observation library, model layer, embedding-based skill RAG) — [github.com/mindcraft-bots/mindcraft](https://github.com/mindcraft-bots/mindcraft) and [arXiv:2504.17950](https://arxiv.org/pdf/2504.17950) (MEDIUM-HIGH)
- Mineflayer plugins (pathfinder, collectblock, tool) — [mineflayer-pathfinder](https://github.com/PrismarineJS/mineflayer-pathfinder), [mineflayer-collectblock](https://github.com/PrismarineJS/mineflayer-collectblock) (HIGH)
- Bun + mineflayer compatibility (4.29.0 on Bun 1.2.15, June 2025) — [PrismarineJS/mineflayer issues](https://github.com/PrismarineJS/mineflayer/issues) (MEDIUM — single anecdotal report; validate via early spike)

---
*Architecture research for: autonomous persistent Minecraft agent (TypeScript)*
*Researched: 2026-06-18*
