---
phase: 10-tech-tree-dag-needs
reviewed: 2026-06-21T23:44:23Z
depth: standard
files_reviewed: 13
files_reviewed_list:
  - src/cognition/nodes.test.ts
  - src/cognition/nodes.ts
  - src/cognition/state.ts
  - src/config.ts
  - src/motivation/goals.test.ts
  - src/motivation/goals.ts
  - src/motivation/tech-tree.test.ts
  - src/motivation/tech-tree.ts
  - src/skills/dig.oom.smoke.test.ts
  - src/skills/dig.test.ts
  - src/skills/dig.ts
  - src/skills/tool-selector.test.ts
  - src/skills/tool-selector.ts
findings:
  critical: 0
  warning: 3
  info: 4
  total: 7
status: issues_found
---

# Phase 10: Code Review Report

**Reviewed:** 2026-06-21T23:44:23Z
**Depth:** standard
**Files Reviewed:** 13
**Status:** issues_found

## Summary

This phase implements the tech-tree DAG resolver (`resolveDag`), the deterministic goal-to-skill router (`goalToSkillParams`), the resources-need bridge in `observe`, the tool-selector ranking by tier, and the dig preflight guard. The overall design is sound: the bridge correctly overwrites `holder.goals` on every tick (line 163), which forces `alreadyHasDag` to always be `false` and ensures the DAG is rebuilt with up-to-date `completedGoalIds` each tick. The topological ordering in `resolveDag` and the `selectGoal` dependency filter cooperate correctly. No critical security or data-loss issues were found.

Three warnings merit attention before declaring the phase complete: a dig timeout that can grow to 10+ minutes when `count > 1` (inconsistent with the documented 10-second bound), an `O(n²)` goal deduplication loop inside `resolveRecipe` that holds up under small DAGs but could silently become expensive if DAG depth increases, and a smelt-dependency edge case where `slice(-1)` produces a single-element `dependsOn` that may silently skip multi-step smelt prerequisites in hypothetical future chains.

---

## Warnings

### WR-01: `dig.ts` timeout scales O(count) but `noProgressToleranceMs` is always 10 s — outer timeout can reach 10+ minutes

**File:** `src/skills/dig.ts:113`

**Issue:** The `timeoutMs` passed to `executeWithSafety` is `config.digTimeoutMs * count`. With the Zod-capped maximum of `count = 64`, this evaluates to `10 000 ms × 64 = 640 000 ms` (10.7 minutes). The inner watchdog (`noProgressToleranceMs: config.digTimeoutMs`) is fixed at 10 s, so in practice the watchdog fires well before the outer timeout. But if `noProgressToleranceMs` is ever raised or its code path is bypassed (e.g., a new executor variant), the outer cap becomes the sole safety net. The documentation comment (`D-13 / 30s navigate, 10s dig`) implies a 10-second bound, making the scaling invisible to future maintainers.

**Fix:** Cap the outer timeout at a multiple that is intentionally generous but bounded, and add a comment:

```typescript
// Outer cap: watchdog (noProgressToleranceMs) fires at 10 s regardless of count;
// this is the outer safety net if watchdog is bypassed. 2× is intentionally generous.
timeoutMs: config.digTimeoutMs * Math.min(count, 2),
```

Or, if progressive timeouts are desired, make the intent explicit:

```typescript
// Allow up to 10 s of watchdog-quiet per block, but never exceed 5 min total.
timeoutMs: Math.min(config.digTimeoutMs * count, 5 * 60 * 1000),
```

---

### WR-02: `resolveRecipe` uses O(n²) deduplication for `allSubGoals`

**File:** `src/motivation/tech-tree.ts:175`

**Issue:** The inner deduplication loop:

```typescript
for (const g of subResult) {
  if (!allSubGoals.some(existing => existing.id === g.id)) {
    allSubGoals.push(g)
  }
}
```

is `O(n²)` where `n` is the number of accumulated goals. With the current DAG cap of depth 8 and typical Minecraft crafting trees, `n` is at most ~30, so this is harmless today. However, if the depth cap is raised or the DAG is reused for a wider item catalog, this becomes a silent performance degradation. Since the ids are strings, a `Set` is the idiomatic fix.

**Fix:**

```typescript
const seenIds = new Set<string>()
const allSubGoals: Goal[] = []

for (const ingredient of ingredientNames) {
  const subResult = resolveDag(ingredient, bot, memo, depth + 1, basePriority, now)
  if ('unresolvable' in subResult) return null
  for (const g of subResult) {
    if (!seenIds.has(g.id)) {
      seenIds.add(g.id)
      allSubGoals.push(g)
    }
  }
}
```

---

### WR-03: `smelt` goal `dependsOn: slice(-1)` silently drops intermediate dependencies for multi-step smelt sources

**File:** `src/motivation/tech-tree.ts:76`

**Issue:**

```typescript
dependsOn: sourceResult.map(g => g.id).slice(-1), // depende do último sub-goal da cadeia
```

For all current `SMELT_MAP` entries (e.g., `iron_ore` → gather-only chain), `sourceResult` is always a single-element array, so `slice(-1)` and the full array are equivalent. However, if a smelt source is ever resolved through a crafting chain (e.g., a hypothetical `smelt:refined_stone` where `stone` is itself crafted), `slice(-1)` would only declare a dependency on the last goal in that chain, while `selectGoal` would unlock the smelt goal too early (as soon as the last step is complete, ignoring whether the earlier crafting steps are done). The comment says "depends on the last sub-goal of the chain" which is correct by chain transitivity only when the chain is linear — but `resolveRecipe` already guarantees linear dependency chains for single-ingredient sources, so the real issue is for multi-ingredient smelt sources that don't currently exist.

This is low-risk today but fragile against future extension. The `SMELT_MAP` currently has only single-source entries, so the bug is latent.

**Fix:** Use the full prereq ID list to be safe, mirroring what `resolveRecipe` does for `craftGoal.dependsOn`:

```typescript
dependsOn: sourceResult.map(g => g.id),
```

This is both more correct and more explicit.

---

## Info

### IN-01: Dead null guard on `holder.completedGoalIds` in `execute` node

**File:** `src/cognition/nodes.ts:314`

**Issue:**

```typescript
if (!holder.completedGoalIds) holder.completedGoalIds = new Set()
```

`createCognitiveStateHolder()` in `state.ts:96` always initializes `completedGoalIds: new Set<string>()`. The `CognitiveStateHolder` interface declares `completedGoalIds: Set<string>` (non-optional), so this guard is unreachable dead code. It may mislead future readers into thinking `completedGoalIds` can be null.

**Fix:** Remove the guard:

```typescript
holder.completedGoalIds.add(goalId)
```

---

### IN-02: D-03 DAG cleanup in `execute` is effectively redundant given `observe` overwrites `holder.goals` on every tick

**File:** `src/cognition/nodes.ts:533-550`

**Issue:** Lines 533-550 clear DAG sub-goals from `holder.goals` and null out `holder.currentGoal` after `no_effect`. However, at the start of every `observe` call, line 163 (`holder.goals = candidates`) resets `holder.goals` to the need-derived goal list, making `alreadyHasDag` always `false` regardless of the D-03 cleanup. The D-03 cleanup thus has no observable effect in the current tick-based execution model.

The code is not harmful, but it is maintenance overhead that can confuse readers. A clarifying comment (or removal) would reduce cognitive load.

**Fix:** Add an explanatory comment, or remove the block and document why in the commit:

```typescript
// NOTE: holder.goals is reset by observe on the next tick (line 163), so this cleanup
// is redundant in practice. Kept as a defensive measure for future non-tick consumers.
```

---

### IN-03: `weapon` regex in `CATEGORY_PATTERNS` matches both swords and axes, potentially selecting an axe when a sword is expected

**File:** `src/skills/tool-selector.ts:29`

**Issue:** The `weapon` pattern is `/_(sword|axe)$/`. If `selectToolFor(bot, 'weapon')` is called with an inventory containing `iron_axe` (tier 3) and `iron_sword` (tier 3), the function returns whichever appears first in the reduce (both have the same tier). More concretely, `stone_sword` (tier 2) + `wooden_axe` (tier 1) → returns `stone_sword`, but `wooden_sword` (tier 1) + `iron_axe` (tier 3) → returns `iron_axe`. Callers expecting a sword for combat may get an axe instead.

The `weapon` category is not used in any of the reviewed files (`dig.ts`, `tool-selector.ts`). If it is consumed by `attack.ts` or `equip.ts`, the behavior should be verified.

**Fix:** If the intent is strictly swords for combat, split the pattern:

```typescript
weapon: /_(sword)$/,
axe: /_axe$/,
```

If axes-as-weapons is intentional for this project (which is reasonable in Minecraft), add a comment explaining the choice.

---

### IN-04: Redundant `resourcesNeed` ternary in `resolveDag` call inside `observe`

**File:** `src/cognition/nodes.ts:200`

**Issue:**

```typescript
resolveDag(techTarget, bot, dagMemo, 0, resourcesNeed ? urgency(resourcesNeed, t, mcfg) : 0.8, t)
```

This code is inside the `if (resourcesUrgent && !currentIsTechGoal)` block. `resourcesUrgent` is `true` only when `resourcesNeed !== undefined`, so `resourcesNeed` is guaranteed to be defined here. The `? urgency(...) : 0.8` else branch is unreachable dead code.

**Fix:**

```typescript
resolveDag(techTarget, bot, dagMemo, 0, urgency(resourcesNeed!, t, mcfg), t)
```

Or restructure to narrow the type:

```typescript
if (resourcesNeed && resourcesUrgent && !currentIsTechGoal) {
  // resourcesNeed is narrowed to Need here
  ...
  resolveDag(techTarget, bot, dagMemo, 0, urgency(resourcesNeed, t, mcfg), t)
}
```

---

_Reviewed: 2026-06-21T23:44:23Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
