# Pitfalls Research

**Domain:** Autonomous persistent Minecraft agent — LLM-driven Mineflayer bot with a perpetual cognitive loop, local model via LM Studio, Bun runtime
**Researched:** 2026-06-18
**Confidence:** MEDIUM-HIGH (Mineflayer/LangGraph/local-LLM pitfalls verified against project issue trackers + multiple agent post-mortems; Bun↔Mineflayer status is fast-moving, MEDIUM)

> Phases referenced map to the project's 4-phase MVP described in `PROJECT.md`:
> - **Fase 1** — Conexão + chat + presença online
> - **Fase 2** — Navegação/movimento autônomo + memória de curto prazo
> - **Fase 3** — Loop cognitivo completo (Observe → Analyze → Update Memory → Plan → Execute → Reflect) + integração LM Studio
> - **Fase 4** — Personalidade adaptativa, memória de longo prazo/semântica, reflexão complexa

---

## Critical Pitfalls

### Pitfall 1: The cognitive loop ticks at LLM speed (think-every-tick)

**What goes wrong:**
The perpetual loop calls the LLM on every iteration (or every game tick / every second). With a local model on LM Studio doing 5–40 tokens/sec, a single "decide what to do" prompt can take 3–30+ seconds. The agent either freezes between decisions (world moves on, plans become stale) or, worse, the loop fires faster than inference completes and queues overlapping LLM calls that thrash the GPU.

**Why it happens:**
Developers model the loop after game loops (fixed tick rate) or after cloud-LLM agents where latency is ~1s. Local inference is 1–2 orders of magnitude slower and the cognitive layer must run at a *different cadence* than the reactive/physics layer.

**How to avoid:**
- **Two-rate architecture.** A fast reactive layer (Mineflayer events, physics, "am I taking damage / falling / stuck") runs continuously and cheaply *without* the LLM. A slow deliberative layer (LLM planning) fires only on triggers: goal completed, plan failed, significant world event, idle timeout, or need crossing a threshold.
- **Single-flight the LLM.** Never start a new cognitive call while one is in flight. Use a mutex/`isThinking` flag; queue at most one pending "re-think" request and coalesce.
- **Event-driven, not poll-driven, thinking.** Re-plan on *change*, not on a timer. Idle agent with a satisfied goal should think rarely (e.g., every 30–60s), not every second.

**Warning signs:**
GPU pinned at 100% with the bot standing still; chat replies arriving 10s+ late; CPU/GPU temps climbing during "idle"; overlapping log entries showing a new plan request before the previous one returned.

**Phase to address:** Fase 3 (loop architecture) — but the two-rate split must be a *design decision before writing the loop*, not retrofitted.

---

### Pitfall 2: Small local models can't be trusted to emit valid JSON / tool calls

**What goes wrong:**
The plan/action selection asks the model for JSON (`{"action": "mineBlock", "args": {...}}`). Small local models (7B–14B class typical for LM Studio) produce malformed JSON, wrap numbers in quotes, add prose before/after the object, hallucinate action names that don't exist, or invent argument fields. Research shows even ~5% per-call failure compounds catastrophically: a 10-step chain at 95%/step finishes only ~60% of the time. Requiring strict JSON also *degrades reasoning* by 20+ points on small models.

**Why it happens:**
Local models are weaker than the GPT-4-class models that agent tutorials assume. Free-form JSON prompting has no enforcement; the model is "asked nicely" to comply.

**How to avoid:**
- **Constrained decoding, not prompting.** LM Studio supports structured output / JSON schema enforcement (grammar-based / GBNF). Define a strict JSON Schema for every LLM decision and enforce it at the inference layer so invalid tokens are impossible — this is far more reliable than parse-and-retry.
- **Closed action vocabulary.** The action name must be an `enum` of real, registered actions. Validate against the action registry; never `eval` or trust an unknown name.
- **Validate-and-repair loop with a hard cap.** After decoding, validate with a schema (Zod). On failure, one repair retry, then fall back to a safe default action (e.g., "wait/observe"). Never retry indefinitely (feeds Pitfall 4).
- **Keep schemas small.** Fewer fields, shallow nesting. Split "plan a 5-step sequence" into "pick the single next action" — small models do single-step far better than multi-step plans.

**Warning signs:**
`JSONDecodeError`/Zod errors in logs; the bot occasionally does nothing or does something nonsensical; actions referencing tools that don't exist; reasoning quality noticeably worse when JSON is required vs. plain chat.

**Phase to address:** Fase 3 (LM Studio integration). The schema + constrained-decoding decision gates the whole loop's reliability.

---

### Pitfall 3: Mineflayer pathfinder gets stuck and hangs the loop indefinitely

**What goes wrong:**
`mineflayer-pathfinder` is a documented source of hangs: it stalls forever when obstructed by an unbreakable block (bedrock), when it lacks the right tool to break a block (leaves without a hoe/shears), when the A* result is *partial* (goal never fires the "done" event), when stuck in water trying to pillar up, or after knockback freezes the bot mid-air. If the cognitive loop is `await`-ing pathfinder to complete, the entire agent deadlocks behind a navigation call that will never resolve.

**Why it happens:**
Developers `await bot.pathfinder.goto(goal)` assuming it always resolves or rejects. Several failure modes neither resolve *nor* reject — they silently hang. The agent has no concept of "this physical action is taking too long."

**How to avoid:**
- **Wrap every movement/action in a timeout + watchdog.** `Promise.race([action, timeout(N seconds)])`. On timeout, cancel the goal (`bot.pathfinder.stop()` / set goal null) and report failure back to the planner.
- **No-progress detector at the physics layer.** Sample position every ~2s; if displacement toward the target is ~0 for several samples while a movement is "active," treat as stuck → abort.
- **Pre-flight feasibility checks.** Before pathing, confirm the bot has the tools to break expected blocks; prefer `GoalNear`/`GoalGetToBlock` with sane ranges over exact goals that may be unreachable.
- **Treat physical failure as normal feedback,** not an exception — feed "couldn't reach X" back into the loop so the planner picks something else (and dampen, per Pitfall 4).

**Warning signs:**
Bot frozen in place but process alive; "sprinting in place" against a wall/bamboo; no events firing; the loop's last log line is a movement start with no completion.

**Phase to address:** Fase 2 (navigation). The timeout/watchdog wrapper is a Fase 2 deliverable — do not ship autonomous movement without it.

---

### Pitfall 4: Goal oscillation, re-planning loops, and need starvation (no global progress)

**What goes wrong:**
With dynamic needs (survival, resources, shelter, curiosity, social) and dynamic goals, the agent thrashes: it starts mining, gets slightly hungry, abandons mining to find food, food task is hard so it re-plans to mine, repeat — *motion without progress*. Re-planning loops are the most token-expensive failure mode. Separately, a low-priority need (curiosity, socialization) can be *starved* forever because a never-fully-satisfied higher need always wins. Oscillation is hard to see locally — only visible at the global "nothing is advancing" level.

**Why it happens:**
Pure greedy "pick highest-priority need every tick" with no hysteresis, no commitment, and no progress accounting. Each need re-evaluation can flip the winner; the agent never commits long enough to finish anything.

**How to avoid:**
- **Commitment / hysteresis.** Once a goal is selected, stick with it until it completes, fails, or a need crosses a *hard* threshold (e.g., health critical) — not merely becomes marginally higher priority. Add a switching cost so ties don't flip every tick.
- **Action-repetition / loop detection.** Hash each (action + args). Same hash N times within a task = loop → force a different action or escalate. Cheap and catches most tool-loops.
- **No-progress watchdog on goals.** Track a progress metric per goal (e.g., inventory count, distance to target). If progress is flat over a window, abandon or decompose the goal — don't re-plan the same thing.
- **Anti-starvation aging.** Increase a need's effective priority the longer it goes unserved, so low-priority needs eventually win a turn.
- **Re-plan budget.** Cap re-plans per goal (e.g., 3). After that, mark the goal blocked and move on.

**Warning signs:**
Inventory/world state unchanged over minutes despite constant activity; the same two goals alternating in logs; a need's value monotonically rising and never being addressed; LLM call count climbing with no game-state change.

**Phase to address:** Fase 3 (goal system + loop). Loop-detection and progress-tracking are first-class loop components, not add-ons.

---

### Pitfall 5: Unbounded memory growth → context-window stuffing → reasoning collapse

**What goes wrong:**
A persistent agent accumulates events, chat, and observations forever. Two linked failures: (a) memory store grows append-only with redundant/contradictory/stale entries, so retrieval surfaces noise; (b) the cognitive prompt stuffs ever-more history into the context window. Local models have *small* context windows, and KV-cache VRAM grows with context (a 7B at 32k can need ~8–10 GB vs ~5 GB at 4k) — so stuffing both slows inference *and* degrades reasoning, and eventually overflows. LM Studio handles overflow badly: it can crash, silently truncate, or emit garbage instead of warning.

**Why it happens:**
"Just append everything and let RAG sort it out" works in demos and dies over hours/days. Developers don't budget the context window or curate memory.

**How to avoid:**
- **Hard token budget for the prompt.** Reserve fixed slices (system + persona, current goal, recent short-term window, K retrieved memories). Never let any slice grow unbounded. Always stay comfortably under the model's configured context (and set LM Studio overflow policy to `truncateMiddle`/`rollingWindow` as a *safety net*, not the primary control).
- **Bounded short-term memory.** Fixed-size ring buffer of recent events; summarize-and-evict older entries into long-term memory.
- **Curate long-term memory.** Deduplicate, consolidate, and decay/forget. Don't just retrieve top-K by similarity — filter for recency and relevance; periodically compact superseded facts.
- **Defer the heavy stuff.** Vector store + embeddings is a Fase 4 concern. For Fase 2–3, a simple bounded buffer + lightweight summarization is enough and avoids premature complexity (the persistence strategy is explicitly open per PROJECT.md).

**Warning signs:**
Prompt token count trending up over a session; inference getting slower the longer the bot runs; LM Studio crashes / "generation failed" / garbage output after long uptime; retrieved memories increasingly irrelevant or contradictory.

**Phase to address:** Fase 2 (short-term buffer + budget) → Fase 4 (long-term/semantic with curation). The token budget must exist from the first LLM-in-the-loop integration.

---

### Pitfall 6: No reconnect/crash recovery — "always-on" isn't

**What goes wrong:**
The core value is *staying alive autonomously*, but Mineflayer bots get kicked or disconnected routinely (timeouts, server restarts, protocol hiccups, `socketClosed`). Without auto-reconnect, the agent dies on the first kick. Worse, naive reconnect bugs are common: reusing a stale `bot` object after `end`, not rebuilding plugin state, or hammering reconnects in a tight loop after a fatal/auth error.

**Why it happens:**
Connection is treated as a one-time setup step, not a managed lifecycle. The `end`/`kicked`/`error` events aren't wired, or reconnect recreates the bot incorrectly.

**How to avoid:**
- **Supervisor pattern.** A connection manager owns the bot lifecycle: handle `end`, `kicked`, `error`; on disconnect, **create a fresh `bot` instance** (don't reuse the dead one), re-register plugins/listeners, and reattach the cognitive loop.
- **Exponential backoff with cap + jitter.** Don't reconnect-spam. Distinguish recoverable disconnects from fatal ones (bad auth, version mismatch, ban) — fatal errors should *stop*, not retry forever.
- **Persist state across reconnects.** Memory and goals live outside the bot object so a reconnect resumes the "mind" rather than resetting it.
- **Pause the cognitive loop while disconnected** so it isn't issuing actions into the void.

**Warning signs:**
Process alive but bot offline; reconnect log spam every few hundred ms; "bot broken upon reconnect" (movement/events dead after reconnect); cognitive loop still running with no world to act on.

**Phase to address:** Fase 1 (stay online) for basic auto-reconnect; harden the supervisor + state persistence in Fase 3.

---

### Pitfall 7: Anti-cheat kicks from superhuman action speed

**What goes wrong:**
The agent acts as fast as code allows: breaking blocks back-to-back, instant rotations, rapid movement. Server anti-cheat/anti-bot plugins flag "breaking blocks too fast," impossible look-snaps, or no-human-delay patterns and kick/ban the bot. A documented Mineflayer failure: after a few normal block breaks the bot starts digging endlessly and gets kicked.

**Why it happens:**
No artificial pacing — the bot does everything at machine speed because nothing throttles it.

**How to avoid:**
- **Pace actions to human-plausible rates.** `await` digging completion, add small randomized delays between repeated actions, respect realistic `digTime`, throttle chat (anti-spam) and rotations.
- **Centralize an action-execution layer** that enforces rate limits, so the LLM/planner can't issue physically impossible bursts.
- **Test against the actual server's plugins.** PROJECT.md targets a *local* Java server for v1 — low risk now, but the pacing layer should exist before any real/public server (currently out of scope, but cheap insurance).

**Warning signs:**
`kicked` with "too fast"/anti-cheat reasons; bot digging in an endless burst; chat-spam kicks.

**Phase to address:** Fase 2 (action execution layer) — build the throttle alongside movement/actions.

---

### Pitfall 8: Bun ↔ Mineflayer runtime edge cases

**What goes wrong:**
Mineflayer (via `minecraft-protocol`, `node-minecraft-protocol`, `protodef`, native crypto/zlib paths) is officially tested on **Node**. On Bun there are reported edge cases — e.g., failures to join certain servers (`socketClosed`/timeout on some MC versions), and NBT/protocol parsing paths that can behave differently. Discovering these *deep into Fase 3* (after building the whole stack on Bun) is expensive.

**Why it happens:**
Bun is chosen for DX/speed (per Constraints) and assumed drop-in Node-compatible. Mineflayer leans on Node internals/native modules where Bun's compatibility is improving but not guaranteed.

**How to avoid:**
- **Validate Bun compatibility in Fase 1, before building anything on top.** A throwaway "connect + walk + read chat + reconnect" spike on the exact target MC version is the cheapest possible de-risking.
- **Keep Node as a tested fallback (already the stated plan).** Don't use Bun-only APIs in core code so switching runtimes stays a one-line change. Pin Mineflayer + `minecraft-data` to versions that match the server's MC version.
- **Treat the runtime decision as reversible** until the spike proves Bun stable for this workload.

**Warning signs:**
`socketClosed`/timeout only under Bun; `PartialReadError`/`TypeError` from NBT/protodef under Bun but not Node; native-module load errors; intermittent disconnects that vanish on Node.

**Phase to address:** Fase 1 — runtime validation is an explicit early gate (PROJECT.md already flags "validar compatibilidade Bun↔Mineflayer").

---

### Pitfall 9: Physics/timing races between the loop and the game world

**What goes wrong:**
The cognitive layer reads world state, the LLM thinks for several seconds, then acts on a *stale* snapshot — the target mob moved, the block was mined by someone else, the bot fell. Or the loop reads inventory/position before Mineflayer has synced after a chunk load/teleport, acting on `undefined`/wrong data. Server tick (20 TPS) and the agent's async actions desync.

**Why it happens:**
Treating Mineflayer state as instantaneously consistent, and assuming the world is frozen during the LLM's multi-second think time.

**How to avoid:**
- **Re-validate just before acting.** Right before executing an action, confirm preconditions still hold (target still exists/in range, block still there, bot not mid-fall). If not, bounce back to the loop.
- **Wait for readiness events.** Use `spawn`, `chunkColumnLoad`, physics-tick hooks before reading state after connect/teleport; guard against `undefined` entities/blocks.
- **Keep deliberation short** (ties into Pitfall 1) so snapshots are fresher.

**Warning signs:**
Bot attacks empty air / mines where a block used to be; actions on entities that just despawned; `undefined` reads right after spawn/teleport.

**Phase to address:** Fase 2 (action execution + precondition checks); reinforced in Fase 3.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Prompt for JSON instead of constrained/grammar-enforced decoding | Fast to wire up | Compounding parse failures, random no-ops, hard-to-debug bad actions | Only a throwaway spike; **never** for the real loop |
| `await pathfinder.goto()` with no timeout/watchdog | Less code | Whole agent deadlocks on a single stuck path | **Never** — watchdog is mandatory |
| Append-everything memory, no curation | Simple, "RAG will fix it" | Reasoning collapse + slowdowns + overflow crashes over hours | OK for a <1h demo; never for "persistent" |
| Reuse the `bot` object on reconnect | Slightly less code | Broken-on-reconnect bugs, dead listeners | **Never** — always fresh instance |
| Single LLM cadence (think every tick) | One simple loop | GPU thrash, stale plans, queued calls | Never on local LLM; two-rate is required |
| No action pacing | Bot acts instantly | Anti-cheat kicks/bans | OK on bare local server with no anti-cheat; never on real servers |
| Multi-step plans from a small model | Feels powerful | Brittle plans, JSON failures, hard recovery | Defer; single-next-action first |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| LM Studio | Assuming it errors loudly on context overflow | It can crash / silently truncate / emit garbage — enforce a prompt token budget; set overflow policy (`truncateMiddle`/`rollingWindow`) as a safety net |
| LM Studio | Free-form JSON prompting | Use structured-output / JSON-schema (grammar) enforcement; closed action enum |
| Mineflayer pathfinder | Awaiting goto with no failure path | Timeout + `stop()` + no-progress detector; feed failure to planner |
| Mineflayer connection | One-shot connect, no lifecycle handling | Supervisor handling `end`/`kicked`/`error` + backoff + fresh bot on reconnect |
| `minecraft-data`/protocol | Letting version auto-negotiate / mismatch | Pin bot `version` to the exact server MC version |
| LangGraph.js | Cyclic StateGraph with no termination | Set explicit `recursionLimit`; add real stop conditions; monitor `langgraph_step` to terminate gracefully before the hard ceiling |
| Bun | Assuming full Node parity for native/protocol code | Spike-test connect/play on Bun early; keep Node fallback; avoid Bun-only APIs in core |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Think-every-tick on local LLM | GPU pinned while idle, late chat, queued calls | Two-rate loop; single-flight LLM; event-driven thinking | Immediately once the loop is always-on |
| Context-window growth over uptime | Inference slows the longer it runs; eventual overflow/crash | Fixed prompt token budget; bounded short-term buffer; summarize+evict | Hours of continuous operation |
| KV-cache VRAM from large context | OOM / heavy slowdown at high context length | Cap context; smaller models; trim retrieved memories | When context approaches 16k–32k on a 7B–14B model |
| Re-planning loops | LLM call count climbs, game state flat | Re-plan budget, progress watchdog, commitment | Within minutes of running the goal system |
| Memory store bloat | Retrieval returns noise/stale/contradictory hits | Dedup, decay, consolidate; recency+relevance filtering | Days of accumulation (Fase 4) |

## Security / Safety Mistakes

> Single-player local-server research project, so classic web-security risks are minimal. The real risks are *agent-control* safety.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Executing/`eval`-ing LLM-proposed code or arbitrary action names | Arbitrary behavior, crashes, griefing the world | Closed action registry + schema validation; never eval model output |
| No spend/iteration cap on the loop | Runaway loop pins hardware indefinitely (local "cost") | Hard caps: max re-plans, max iterations per goal, loop-detection kill switch |
| Trusting chat input from players into prompts unfiltered | Prompt injection: a player tells the bot to grief/leak/spam | Treat player chat as untrusted data, not instructions; constrain what chat can trigger; sanitize before embedding in prompts |
| LM Studio endpoint exposed beyond localhost | Other processes/machines can drive the model | Bind to localhost; it's a local-only dependency in v1 |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Chat replies arrive 10–30s late (LLM latency) | Feels broken/unresponsive | Fast canned acknowledgements + async LLM reply; keep persona prompt small; consider a smaller/faster model for chat than for planning |
| Bot "freezes" while thinking | Looks crashed | Keep reactive layer alive (look around, small idle motions) so it appears alive during deliberation |
| Bot spams chat | Annoying, anti-spam kicks | Rate-limit chat; only speak when it adds value |
| Visibly stuck against a wall | Looks dumb / dead | No-progress watchdog → recover and try elsewhere (Pitfall 3/4) |
| Goal thrashing visible in-world | Bot looks indecisive/insane | Commitment + hysteresis (Pitfall 4) |

## "Looks Done But Isn't" Checklist

- [ ] **Connection:** Connects fine once — but does it survive a kick/server restart? Verify auto-reconnect with a fresh bot instance and resumed state.
- [ ] **Navigation:** Reaches a nearby goal — but does it recover from bedrock/no-tool/partial-path/water hangs? Verify timeout + no-progress watchdog actually fire and report failure.
- [ ] **LLM loop:** Picks good actions in a demo — but does it produce valid JSON across hundreds of calls? Verify schema enforcement + repair + safe fallback; log parse-failure rate.
- [ ] **Goal system:** Works for one goal — but does it avoid oscillation/starvation over a long run? Verify loop detection, progress tracking, commitment, anti-starvation aging.
- [ ] **Memory:** Remembers recent events — but does prompt size stay bounded over hours? Verify token budget and that inference speed/quality don't degrade with uptime.
- [ ] **Bun:** App boots on Bun — but does Mineflayer actually play (move, dig, reconnect) for the target MC version? Verify with a real play spike, not just connect.
- [ ] **Always-on:** Runs for 5 minutes — but does it survive overnight? Run a long-soak test and watch for memory growth, reconnect spam, and LM Studio crashes.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Think-every-tick already built | MEDIUM | Refactor to two-rate loop; add single-flight mutex + event triggers. Painful if loop is entangled — design upfront |
| JSON unreliability discovered late | LOW–MEDIUM | Switch to LM Studio structured-output/grammar; add Zod validate-repair-fallback |
| Pathfinder hangs in production | LOW | Wrap actions in timeout/watchdog; add stuck detector — localized change |
| Goal oscillation | MEDIUM | Add commitment/hysteresis, loop-detection, progress watchdog, re-plan budget to goal selector |
| Memory blowup | MEDIUM | Introduce token budget + bounded buffer + summarization; backfill curation/decay |
| No reconnect | LOW | Wrap in supervisor with backoff + fresh-bot rebuild; move state outside bot object |
| Bun incompatibility | LOW (if early) / HIGH (if late) | Switch to Node fallback — trivial if Bun-only APIs avoided; costly if Bun-specific code is everywhere |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Bun↔Mineflayer edge cases | Fase 1 | Play-spike (move/dig/chat/reconnect) on target MC version under Bun passes |
| No reconnect / not always-on | Fase 1 (basic), Fase 3 (hardened) | Kick the bot / restart server → it rejoins with state intact; overnight soak survives |
| Pathfinder hang / stuck | Fase 2 | Force unreachable/bedrock/water targets → watchdog aborts and reports, loop continues |
| Anti-cheat / superhuman speed | Fase 2 | Repeated digging is paced; no "too fast" kicks; action layer enforces rate limits |
| Physics/timing races | Fase 2 (→3) | Precondition re-checks present; no acting on stale/`undefined` state after teleport/spawn |
| Memory growth / context stuffing | Fase 2 (budget) → Fase 4 (curation) | Prompt token count stays bounded over a multi-hour run; inference speed stable |
| Think-every-tick cadence | Fase 3 | Two-rate loop verified; idle bot makes few LLM calls; single-flight enforced |
| JSON / tool-call unreliability | Fase 3 | Constrained decoding + schema; logged parse-failure rate near 0; unknown actions rejected |
| Goal oscillation / starvation / re-plan loops | Fase 3 | Loop-detection + progress watchdog + commitment + aging verified over a long run; LLM-call count tracks game-state change |

## Sources

- [mineflayer-pathfinder #222 — hangs on unbreakable block](https://github.com/PrismarineJS/mineflayer-pathfinder/issues/222)
- [mineflayer-pathfinder #273 — stuck on partial/incomplete path](https://github.com/PrismarineJS/mineflayer-pathfinder/issues/273)
- [mineflayer-pathfinder #332 — bot constantly stuck/halts with GoalFollow](https://github.com/PrismarineJS/mineflayer-pathfinder/issues/332)
- [mineflayer-pathfinder PR #90 — bot getting stuck in water](https://github.com/PrismarineJS/mineflayer-pathfinder/pull/90)
- [mineflayer #3887 — freezes mid-air after knockback (1.21.x)](https://github.com/PrismarineJS/mineflayer/issues/3887)
- [mineflayer #623 / #164 / #767 / #865 — reconnect on kick/disconnect; broken-on-reconnect](https://github.com/PrismarineJS/mineflayer/issues/623)
- [mineflayer #2778 — endless block breaking → anti-cheat kick](https://github.com/PrismarineJS/mineflayer/issues/2778)
- [mineflayer #1091 / #3805 — anti-bot/anti-cheat kicks, "too fast"](https://github.com/PrismarineJS/mineflayer/issues/1091)
- [mineflayer #3669 / #3714 / #3623 — NBT crashes, version compat, login packet issues](https://github.com/PrismarineJS/mineflayer/issues/3714)
- [Voyager: An Open-Ended Embodied Agent with LLMs (arXiv 2305.16291) — token cost, weak-model self-improvement failure](https://arxiv.org/abs/2305.16291)
- [Odyssey: Open-World Skills (arXiv 2407.15325) — open-weight models struggle on basic tasks](https://arxiv.org/pdf/2407.15325)
- [The Agent Loop Problem — oscillation / re-planning loops / motion≠progress (Medium)](https://medium.com/@Modexa/the-agent-loop-problem-when-smart-wont-stop-ccbf8489180f)
- [How to Prevent Infinite Loops in AI Agents — action-hash repetition detection, time-per-step (BSWEN)](https://docs.bswen.com/blog/2026-03-11-prevent-ai-agent-infinite-loops/)
- [browser-use #191 — endless-loop detection to avoid high LLM cost](https://github.com/browser-use/browser-use/issues/191)
- [Reliable Structured Output from Local LLMs — grammar-constrained decoding, compounding failure (Markaicode)](https://markaicode.com/ollama-structured-output-pipeline/)
- [Structured Outputs in Production — 95%/step → ~60% over 10 steps; need >99%/step (Tensoria)](https://tensoria.fr/en/blog/structured-outputs-llm-production)
- [LM Studio bug #1620 — crash when context length exceeded / inoperative truncation](https://github.com/lmstudio-ai/lmstudio-bug-tracker/issues/1620)
- [LM Studio bug #1806 — silent failure / garbage output on context overflow after large tool response](https://github.com/lmstudio-ai/lmstudio-bug-tracker/issues/1806)
- [LM Studio prediction config — context overflow policies (stopAtLimit/truncateMiddle/rollingWindow)](https://lmstudio.ai/docs/typescript/api-reference/llm-prediction-config-input)
- [A Practical Guide to Memory for Autonomous LLM Agents (Towards Data Science) — append-only bloat, curation is the hard part](https://towardsdatascience.com/a-practical-guide-to-memory-for-autonomous-llm-agents/)
- [LangGraph.js #1524 — recursionLimit / GraphRecursionError (default 25), termination conditions](https://github.com/langchain-ai/langgraphjs/issues/1524)

---
*Pitfalls research for: autonomous persistent LLM-driven Mineflayer agent (local model, perpetual loop, Bun)*
*Researched: 2026-06-18*
