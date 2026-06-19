# Feature Research

**Domain:** Autonomous persistent Minecraft agent ("living NPC" / embodied LLM agent)
**Researched:** 2026-06-18
**Confidence:** HIGH (prior art well-documented: Voyager, Mindcraft, Project Sid/PIANO, Stanford Generative Agents; mineflayer plugin ecosystem verified)

> **Note on "users":** MineMind is a research/learning project, not a commercial product. "Table stakes" here means *"without this, it is not an autonomous agent — just a scripted bot."* "Differentiators" means *"what makes MineMind a living agent vs. a Voyager clone."* Categories are framed against the prior art, not a paying market.

## Prior Art Map (what each project actually has)

| Project | What it is | Core features | Relevance to MineMind |
|---------|-----------|---------------|----------------------|
| **Voyager** (MineDojo, 2023) | First LLM lifelong-learning Minecraft agent | Automatic curriculum (self-generated tasks), ever-growing skill library (executable JS code), iterative prompting w/ self-verification + error feedback. GPT-4, no fine-tuning. | Skill library + self-verification loop = gold standard for *learning*. v1 should NOT copy this (cloud GPT-4 dependent, code-gen heavy). |
| **Mindcraft** (mindcraft-bots) | Production-grade mineflayer + LLM framework | 15+ LLM providers incl. **Ollama (local)**, per-bot JSON memory (structures/deaths/ores/skill success), profiles (personality prompts), multi-agent coordination + team bulletin, ~500ms decision loop, optional sandboxed code execution. | Closest architectural sibling. Validates the all-JS mineflayer+LLM stack and local-LLM path. Reference for memory-as-JSON and profiles. |
| **Project Sid / PIANO** (Altera, 2024) | 10–1000+ agent civilization sim | PIANO: concurrent modules + Cognitive Controller (CC) through an **information bottleneck**, social modules, emergent roles/culture/economy, long-horizon autonomy. | The cognitive-loop + needs/social vision. The "say one thing but do another" coherence problem is the key warning for concurrent designs. |
| **Stanford Generative Agents** (Park, 2023) | The Sims-like town of LLM agents | **Memory stream** (NL events) + **retrieval scored by recency × relevance × importance** + **reflection** (synthesize higher-level inferences) + planning. | Directly defines MineMind's multi-tier memory + Reflecting state. The retrieval scoring formula is the canonical pattern to adopt. |
| **mineflayer + plugins** (PrismarineJS) | Node Minecraft bot library | `pathfinder` (A* nav, static/dynamic goals), `collectblock` (mine + tool-select + collect + auto-deposit), `pvp`/`tool`/`armor-manager`. Java Edition only. | The "hands and eyes." Provides the entire Action Layer for free — table stakes are mostly *integration*, not invention. |

## Feature Landscape

### Table Stakes (without these it is not an autonomous agent)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Connect & stay online (persistence) | Core Value: agent must *live* continuously, survive disconnects/reconnects | LOW | mineflayer `createBot` + auto-reconnect. Maps to **Fase 1**. |
| Perceive world state | No perception → no agency; LLM needs grounded context (position, nearby entities/blocks, inventory, health/hunger, time) | MEDIUM | mineflayer exposes all of this. Bottleneck: condensing into a token-budget-friendly prompt. Maps to **Fase 1/3**. |
| Cognitive loop (Observe → Analyze → Update Memory → Plan → Execute → Reflect) | This *is* the product per Core Value. Every prior art has a loop (Voyager iterative prompt, Mindcraft 500ms, PIANO CC, Generative Agents plan cycle) | HIGH | LangGraph state machine. The single most load-bearing component. Maps to **Fase 1/2**. |
| Autonomous navigation/movement | "Autonomous movement" is a stated v1 requirement; a stationary agent reads as broken | LOW–MEDIUM | `mineflayer-pathfinder` (A*). Integration, not invention. Maps to **Fase 1**. |
| Read chat & respond coherently | Stated v1 requirement; the primary human-facing signal of intelligence | MEDIUM | mineflayer chat events + LLM. Coherence depends on context assembly (memory + state). Maps to **Fase 1/2**. |
| Short-term memory (recent events/conversations/actions) | Without it, the agent has amnesia each tick → incoherent. Stated v1 requirement | LOW–MEDIUM | In-memory ring buffer / sliding window of NL events. Maps to **Fase 1/2**. |
| Local LLM integration (LM Studio) | Stated v1 constraint; enables always-on loop at zero cost | MEDIUM | LM Studio OpenAI-compatible endpoint via LangChain. Mindcraft proves local (Ollama) is viable. Maps to **Fase 1**. |
| Behavioral state representation | A "cognitive state machine" (Idle/Exploring/…/Reflecting) is the project's named architecture | MEDIUM | The states are the loop's output. Fewer states implemented = fine for v1 (Idle, Exploring, Socializing). Maps to **Fase 2**. |

### Differentiators (what makes MineMind a *living agent*, not a Voyager clone)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Internal needs system (survival, resources, shelter, curiosity, socialization) | Drives *intrinsic* motivation — agent acts without prompts. This is the "living NPC" hook; Voyager uses external curriculum, not internal needs | MEDIUM | Decaying scalar drives that bias goal selection. Distinct from Voyager. Maps to **Fase 3**. |
| Dynamic goals (priority / progress / dependencies / internal reward) | Self-directed agenda; Project Sid's "frustratingly independent" agents came from this | MEDIUM–HIGH | Goal queue scored by needs + state. The bridge between needs and the loop. Maps to **Fase 3**. |
| Multi-tier memory (short-term + long-term + semantic) | Continuity of identity across sessions — the difference between a chatbot and a *persona* | HIGH | Long-term/semantic persistence strategy is an OPEN research question (SQLite vs JSON vs vector store). Adopt Generative Agents retrieval (recency×relevance×importance). Maps to **Fase 4** (short-term in Fase 1). |
| Reflection (Reflecting state) | Synthesizes raw memories into higher-level beliefs/lessons — the mechanism behind perceived growth | MEDIUM–HIGH | Periodic LLM pass over recent memory → writes summaries back to long-term store. Straight from Generative Agents. Maps to **Fase 4**. |
| Per-player social profiles | Relationships that evolve (trust, sentiment, history per player) — the emotional payoff of a "living" agent | MEDIUM | Keyed memory records per player. Differentiator vs. stateless chat bots. Maps to **Fase 4**. |
| Evolving personality | Identity that drifts based on experience; combined w/ profiles + reflection = the headline feature | HIGH | Highest-risk, lowest-defined. Correctly deferred to **Fase 4**. Start with a *static* personality prompt (Mindcraft profile style) in v1. |
| Skill acquisition / learning (Voyager-style) | Genuine capability growth over time | VERY HIGH | Voyager's domain. Deliberately a v2+ stretch, not a differentiator MineMind needs to compete on now. |

### Anti-Features (deliberately do NOT build for research/learning v1)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| LLM-generated executable code (Voyager/Mindcraft `allow_insecure_coding`) | "Let the agent write its own skills" feels powerful | Security (code injection on host), debugging nightmare, non-deterministic; fights the "clean, instructive design" goal | Hand-authored action primitives the LLM *selects* from (tool-calling), not code it writes. |
| Concurrent/parallel cognitive modules (full PIANO) | Real-time coherence, looks state-of-the-art | The "say one thing, do another" coherence problem; needs a Cognitive Controller + bottleneck to tame. Massive complexity for one agent | Single sequential LangGraph loop. Revisit concurrency only if real-time responsiveness becomes a measured problem. |
| Multi-agent society / coordination (Project Sid, Mindcraft teams) | Emergent civilization is the flashy demo | Multiplies state, comms, and failure modes; v1 explicitly targets one bot on a local server | One agent first. Social system is *per-player* (humans), not multi-bot. |
| Vector store + embeddings for memory in v1 | "Proper" semantic memory | Adds infra (embedding model, DB) before short-term memory is even proven; premature optimization | Start with in-memory + flat JSON/SQLite. Add embeddings in Fase 4 *after* retrieval need is demonstrated. |
| Cloud LLM providers (Claude/GPT/Gemini) in v1 | Stronger reasoning, easier coherence | Cost + rate limits kill an always-on loop; explicitly Out of Scope per PROJECT.md | LM Studio local now; design a provider abstraction so cloud is a swap later. |
| Combat / PvP as a v1 focus | "Fighting" is a listed cognitive state | Survival pressure complicates the loop and memory before basics work; high failure surface | Keep `Fighting` state stubbed/minimal (flee or basic survival). `mineflayer-pvp` available when prioritized. |
| Complex building (blueprints, megastructures) | "Building" is a listed state; impressive demos | Planning + spatial reasoning is hard for local LLMs; not core to the cognitive-loop thesis | `Building` state stubbed in v1; basic block placement only if needed. |
| Bedrock Edition support | Broader reach | mineflayer is Java-only — technically impossible | Java Edition only (already Out of Scope in PROJECT.md). |
| Public/multiplayer server in v1 | Real-world validation | Uncontrolled environment, grief/latency, harder debugging | Local Java server (already Out of Scope in PROJECT.md). |

## Feature Dependencies

```
Connect & stay online (Fase 1)
    └──enables──> Perceive world state (Fase 1)
                      └──feeds──> Cognitive loop (Fase 1/2)
                                      ├──drives──> Navigation (Fase 1)
                                      ├──drives──> Chat response (Fase 1/2)
                                      └──requires──> Short-term memory (Fase 1/2)

Short-term memory ──grows into──> Multi-tier memory (Fase 4)
                                       └──required-by──> Reflection (Fase 4)
                                       └──required-by──> Per-player social profiles (Fase 4)

Needs system (Fase 3) ──feeds──> Dynamic goals (Fase 3) ──feeds──> Cognitive loop (selects state)

Reflection (Fase 4) ──enables──> Evolving personality (Fase 4)
Per-player profiles (Fase 4) ──enhances──> Chat coherence + Socializing state

LLM-generated code ──conflicts──> "clean instructive design" goal (anti-feature)
Concurrent modules ──conflicts──> single sequential loop (anti-feature)
```

### Dependency Notes

- **Cognitive loop requires short-term memory:** each tick needs recent context or the agent is amnesiac and incoherent. This is why short-term memory is Fase 1, not deferred.
- **Reflection requires multi-tier memory:** you cannot synthesize higher-level beliefs without a persisted memory stream to read from. Both land in Fase 4 together.
- **Dynamic goals require the needs system:** goals are scored/prioritized by need pressure; building goals before needs leaves nothing to prioritize against. Both in Fase 3.
- **Evolving personality enhanced by reflection + profiles:** personality drift is the *output* of reflecting over accumulated social/experiential memory — hence it correctly sits last (Fase 4).
- **Needs/goals enhance the loop but don't block it:** Fase 1/2 loop can run on simple heuristics (idle → wander → respond); needs make it *purposeful*. This ordering lets the loop be validated before motivation is layered on.

## MVP Definition

### Launch With (v1 — Fase 1, validating Core Value)

The single non-negotiable: the **Observe → Decide → Act** loop must work.

- [ ] Connect to local Java server + stay online (auto-reconnect) — agent must *live*
- [ ] Perceive core world state (position, nearby entities/blocks, inventory, health/time) — input to every decision
- [ ] LM Studio local LLM integration via LangChain — the reasoning engine
- [ ] Basic cognitive loop in LangGraph (Observe → Analyze → Plan → Execute) — *this is the thesis*
- [ ] Autonomous navigation via `mineflayer-pathfinder` — visible autonomy
- [ ] Read chat + respond coherently — primary intelligence signal
- [ ] Short-term memory (sliding window of NL events) — prevents amnesia
- [ ] Static personality prompt (Mindcraft-profile style) — coherent voice without the Fase 4 complexity

### Add After Validation (v1.x — Fase 2 & 3)

- [ ] Full cognitive state machine (Idle, Exploring, Gathering, Socializing; Fighting/Building stubbed) — trigger: loop is stable and observable
- [ ] Needs system (survival, resources, shelter, curiosity, socialization) — trigger: agent wanders aimlessly and needs intrinsic motivation
- [ ] Dynamic goals (priority/progress/dependencies/reward) — trigger: needs exist and must be turned into actionable agendas

### Future Consideration (v2+ — Fase 4 and beyond)

- [ ] Multi-tier memory persistence (long-term + semantic) — defer until short-term memory's limits are felt; resolve SQLite vs JSON vs vector store *then*
- [ ] Reflection state (synthesize beliefs) — defer until there is a persisted memory stream to reflect over
- [ ] Per-player social profiles — defer until long-term memory exists to anchor relationships
- [ ] Evolving personality — defer until reflection + profiles exist (it is their emergent product)
- [ ] Cloud LLM provider abstraction — defer until local reasoning limits are measured
- [ ] Voyager-style skill acquisition — stretch; only if learning becomes a research goal

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Cognitive loop (LangGraph) | HIGH | HIGH | P1 |
| Connect + stay online | HIGH | LOW | P1 |
| Perceive world state | HIGH | MEDIUM | P1 |
| LM Studio LLM integration | HIGH | MEDIUM | P1 |
| Autonomous navigation | HIGH | LOW | P1 |
| Chat read + respond | HIGH | MEDIUM | P1 |
| Short-term memory | HIGH | LOW | P1 |
| Static personality prompt | MEDIUM | LOW | P1 |
| Cognitive state machine (full) | HIGH | MEDIUM | P2 |
| Needs system | HIGH | MEDIUM | P2 |
| Dynamic goals | HIGH | HIGH | P2 |
| Multi-tier memory persistence | HIGH | HIGH | P3 |
| Reflection | MEDIUM | HIGH | P3 |
| Per-player social profiles | MEDIUM | MEDIUM | P3 |
| Evolving personality | MEDIUM | HIGH | P3 |
| LLM-generated code | LOW | HIGH | (anti) |
| Multi-agent society | LOW | VERY HIGH | (anti) |
| Combat/Building focus | LOW | MEDIUM | (anti) |

## Competitor Feature Analysis

| Feature | Voyager | Mindcraft | Project Sid (PIANO) | Our Approach (MineMind v1) |
|---------|---------|-----------|---------------------|----------------------------|
| Cognitive loop | Iterative prompt + self-verify | ~500ms LLM decision loop | Concurrent modules + Cognitive Controller | Single sequential LangGraph loop |
| Memory | Skill library (code) | Per-bot JSON (structures/ores/deaths) | Per-agent + social memory | Short-term (v1) → multi-tier (Fase 4), Generative-Agents retrieval |
| LLM | GPT-4 (cloud) | 15+ providers incl. Ollama local | GPT-4 class | LM Studio local first, abstraction for cloud later |
| Personality | None (task-driven) | Static profile prompts | Emergent via social modules | Static prompt (v1) → evolving (Fase 4) |
| Motivation | External auto-curriculum | User tasks/commands | Internal + emergent goals | Internal **needs system** → dynamic goals (Fase 3) |
| Social | None | Multi-bot team bulletin | Emergent society (1000 agents) | **Per-player** profiles w/ humans (Fase 4), single agent |
| Action layer | Self-written JS code | Mineflayer + sandboxed code | Custom Minecraft env | Mineflayer + curated primitives (no code-gen) |
| Stack | Python | Node/JS | Custom | All-TypeScript (Bun + mineflayer + LangGraph.js) |

**Key takeaways for roadmap:**
1. MineMind's defensible identity is **internal needs + multi-tier memory + per-player social + evolving personality** — the "living being" axis Voyager/Mindcraft don't pursue.
2. The **action layer is mostly free** via mineflayer plugins — v1 effort belongs in the cognitive loop and memory, not in re-inventing navigation/mining.
3. Avoid the two biggest complexity traps prior art fell into: **LLM code-gen** (Voyager/Mindcraft security + debugging) and **concurrent modules** (PIANO coherence problem). A single sequential loop is the right v1 simplification given the "clean, instructive" goal.

## Sources

- [Voyager — arXiv 2305.16291](https://arxiv.org/abs/2305.16291) / [GitHub MineDojo/Voyager](https://github.com/MineDojo/Voyager) / [project site](https://voyager.minedojo.org/) — HIGH
- [Mindcraft — GitHub mindcraft-bots/mindcraft](https://github.com/mindcraft-bots/mindcraft) — HIGH
- [Minecraft AI: Bridging LLMs with Mineflayer (typevar.dev)](https://typevar.dev/articles/mindcraft-bots/mindcraft) — MEDIUM
- [Project Sid — arXiv 2411.00114](https://arxiv.org/pdf/2411.00114) / [Altera blog (Fundamental Research Labs)](https://fundamentalresearchlabs.com/blog/project-sid) — HIGH
- [Stanford Generative Agents — arXiv 2304.03442](https://arxiv.org/pdf/2304.03442) / [ACM full text](https://dl.acm.org/doi/fullHtml/10.1145/3586183.3606763) — HIGH
- [mineflayer-pathfinder](https://github.com/PrismarineJS/mineflayer-pathfinder) / [mineflayer-collectblock](https://github.com/PrismarineJS/mineflayer-collectblock) / [mineflayer.com](https://mineflayer.com/) — HIGH

---
*Feature research for: autonomous persistent Minecraft agent*
*Researched: 2026-06-18*
