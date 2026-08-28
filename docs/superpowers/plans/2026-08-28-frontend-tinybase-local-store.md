# Frontend TinyBase Local Store Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace this app's scattered `localStorage`-backed trial/level-stats storage with a single TinyBase `Store` (IndexedDB-persisted), with zero change in app behavior, so the offline sync engine (a later plan) has a durable local substrate to build a write queue on top of.

**Architecture:** One module-level TinyBase `Store` singleton (`storage/store.ts`), a unified `trials` table (Level and Practice trials together, `runType`-discriminated, matching the backend's `trial_results` shape) and a `levelStats` table, both replacing today's separate `localStorage` keys behind the *exact same* exported functions (`loadLevelStats`, `updateLevelRecord`, `loadTrialHistory`, `appendTrials`, etc.) — every call site outside `storage/` stays untouched except for three components that need to wait for the IndexedDB persister's initial (async) load before reading, tracked via a small Zustand store (`storageStore.ts`, mirroring the existing `authStore.ts` pattern) rather than a global rendering gate. Every newly-built trial gets a client-generated `trialId`, threaded through to the sync payload — the backend already accepts it (PR #36) as an optional dedup key.

**Tech Stack:** `tinybase` (core `createStore` + `tinybase/persisters/persister-indexed-db` + `tinybase/ui-react`'s `useCreatePersister`), Zustand (already in use), `fake-indexeddb` (dev, for testing the persister in Vitest's jsdom environment).

**Spec:** `docs/adr/0001-local-first-sync-append-only-tinybase.md`

## Global Constraints

- Every function currently exported from `storage/levelStats.ts`, `storage/trialHistory.ts`, `storage/practiceHistory.ts` keeps its exact name, parameters, and return type. No call site outside `storage/` should need to change except the three noted in Task 5.
- No `tinybase/ui-react` hooks (`useTable`, `useCell`, `Provider`, etc.) anywhere except `storage/StorageBoot.tsx`'s `useCreatePersister` call — every other read/write goes through the plain, non-React `Store` API (`getRow`, `setRow`, `getSortedRowIds`, `delRow`), matching this codebase's existing style of plain data-access functions plus a separate Zustand store for reactive state.
- `MAX_TRIALS = 2000` stays a **per-`runType` cap** (Level and Practice each capped independently), matching today's behavior exactly — the two histories happening to share one table now is an implementation detail, not a behavior change.
- Run frontend tests with `pnpm --filter frontend exec vitest run <path>` from the repo root.
- Explicit non-goals, deferred to later plans: the durable write queue / retry / `GET /sync/pull` integration (a separate "sync engine" plan), and switching `level_stats` from an imperative best-record cache to a TinyQL query (deliberately deferred — see conversation).

---

### Task 1: TinyBase store, ready-flag, and boot wiring

**Files:**
- Create: `apps/frontend/src/storage/store.ts`
- Create: `apps/frontend/src/storage/storageStore.ts`
- Create: `apps/frontend/src/storage/StorageBoot.tsx`
- Create: `apps/frontend/src/storage/StorageBoot.test.tsx`
- Modify: `apps/frontend/app/layout.tsx`
- Modify: `apps/frontend/package.json` (add `tinybase` dependency, `fake-indexeddb` dev dependency)
- Modify: `apps/frontend/vitest.setup.ts`

**Interfaces:**
- Produces: `store` (a TinyBase `Store` singleton) from `storage/store.ts` — imported directly by Tasks 2–3's storage modules. `storageStore` (Zustand vanilla store, `{ ready: boolean }`) and `useStorage<T>(selector: (s: StorageStoreState) => T): T` from `storage/storageStore.ts` — used by Task 5's components.

- [ ] **Step 1: Add dependencies**

```bash
pnpm --filter frontend add tinybase
pnpm --filter frontend add -D fake-indexeddb
```

- [ ] **Step 2: Wire `fake-indexeddb` into the test environment**

In `apps/frontend/vitest.setup.ts`, add at the top (before the existing content):

```ts
import "fake-indexeddb/auto";
```

- [ ] **Step 3: Write the failing test for `StorageBoot`**

```tsx
// apps/frontend/src/storage/StorageBoot.test.tsx
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render } from "@testing-library/react";
import { store } from "./store";
import { storageStore } from "./storageStore";
import { StorageBoot } from "./StorageBoot";

beforeEach(() => {
  store.delTables();
  storageStore.setState({ ready: false });
});

describe("StorageBoot", () => {
  it("flips storageStore.ready to true once the IndexedDB persister has loaded", async () => {
    expect(storageStore.getState().ready).toBe(false);

    render(<StorageBoot />);

    await vi.waitFor(() => {
      expect(storageStore.getState().ready).toBe(true);
    });
  });

  it("makes previously-persisted data available on the store once ready", async () => {
    // Simulate a prior session's data already sitting in IndexedDB under
    // the same database name StorageBoot will use.
    const { createStore } = await import("tinybase");
    const { createIndexedDbPersister } = await import("tinybase/persisters/persister-indexed-db");
    const seedStore = createStore();
    seedStore.setRow("levelStats", "1", { stars: 3, totalTime: 5000, completedAt: "2025-01-01T00:00:00.000Z" });
    const seedPersister = createIndexedDbPersister(seedStore, "moravec-store");
    await seedPersister.save();
    seedPersister.destroy();

    render(<StorageBoot />);

    await vi.waitFor(() => {
      expect(storageStore.getState().ready).toBe(true);
    });
    expect(store.getRow("levelStats", "1")).toEqual({ stars: 3, totalTime: 5000, completedAt: "2025-01-01T00:00:00.000Z" });
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `pnpm --filter frontend exec vitest run src/storage/StorageBoot.test.tsx`
Expected: FAIL — `./store`, `./storageStore`, `./StorageBoot` don't exist yet.

- [ ] **Step 5: Create the store singleton**

```ts
// apps/frontend/src/storage/store.ts
import { createStore } from "tinybase";

/**
 * The one TinyBase Store for this app's local-first data — created eagerly
 * at module load (safe on both server and client: an in-memory Store needs
 * no browser API to exist). Actual IndexedDB persistence is wired up
 * separately, client-only, by StorageBoot — see its comment for why.
 */
export const store = createStore();
```

- [ ] **Step 6: Create the ready-flag Zustand store**

```ts
// apps/frontend/src/storage/storageStore.ts
import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";

export type StorageStoreState = {
  /**
   * True once the IndexedDB persister has finished its initial load into
   * `store` (see StorageBoot). Reading `store` before this is true risks
   * seeing an empty table even though persisted data exists — components
   * that read trial/level-stats data must wait for this to flip, the same
   * way authStore.hydrate() must run before AuthState is trustworthy.
   */
  ready: boolean;
};

export const storageStore = createStore<StorageStoreState>(() => ({
  ready: false,
}));

export function useStorage<T>(selector: (s: StorageStoreState) => T): T {
  return useStore(storageStore, selector);
}
```

- [ ] **Step 7: Create `StorageBoot`**

```tsx
// apps/frontend/src/storage/StorageBoot.tsx
"use client";

import { useCreatePersister } from "tinybase/ui-react";
import { createIndexedDbPersister } from "tinybase/persisters/persister-indexed-db";
import { store } from "./store";
import { storageStore } from "./storageStore";

/**
 * Sets up IndexedDB persistence for `store`, client-only — mirrors
 * AuthBoot's pattern (a boot component that fires async setup on mount,
 * rendered once in the root layout). useCreatePersister handles creating
 * the persister exactly once and cleaning it up on unmount; the `then`
 * callback is where the initial load + auto-save actually start, and is
 * the one place storageStore.ready flips to true.
 */
export function StorageBoot() {
  useCreatePersister(
    store,
    (s) => createIndexedDbPersister(s, "moravec-store"),
    [],
    async (persister) => {
      await persister.startAutoLoad();
      await persister.startAutoSave();
      storageStore.setState({ ready: true });
    },
  );

  return null;
}
```

- [ ] **Step 8: Wire `StorageBoot` into the root layout**

In `apps/frontend/app/layout.tsx`:

```tsx
import { AuthBoot } from "@/auth/AuthBoot";
import { StorageBoot } from "@/storage/StorageBoot";
import { QueryProvider } from "@/providers/QueryProvider";
```

and inside `<QueryProvider>`, alongside the existing `<AuthBoot />`:

```tsx
<QueryProvider>
  <AuthBoot />
  <StorageBoot />
  <main className="min-h-dvh flex items-start justify-center p-6 pt-12">
    {children}
  </main>
</QueryProvider>
```

- [ ] **Step 9: Run the test to verify it passes**

Run: `pnpm --filter frontend exec vitest run src/storage/StorageBoot.test.tsx`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add apps/frontend/package.json apps/frontend/vitest.setup.ts apps/frontend/app/layout.tsx apps/frontend/src/storage/store.ts apps/frontend/src/storage/storageStore.ts apps/frontend/src/storage/StorageBoot.tsx apps/frontend/src/storage/StorageBoot.test.tsx apps/frontend/pnpm-lock.yaml
git commit -m "feat(frontend): add TinyBase store + IndexedDB-backed boot"
```

---

### Task 2: `levelStats.ts` on TinyBase

**Files:**
- Modify: `apps/frontend/src/storage/levelStats.ts`
- Modify: `apps/frontend/src/storage/levelStats.test.ts`

**Interfaces:**
- Consumes: `store` from Task 1.
- Produces: no change to `LevelStats`, `PersistedLevelStats`, `loadLevelStats`, `saveLevelStats`, `updateLevelRecord`, `isLevelUnlocked`, `mergeRemoteLevelStats` — same signatures, same behavior, now backed by the `levelStats` TinyBase table (row id = `String(levelNumber)`, cells `stars`/`totalTime`/`completedAt`) instead of `localStorage`.

- [ ] **Step 1: Rewrite the test to exercise the TinyBase-backed store instead of a `localStorage` mock**

```ts
// apps/frontend/src/storage/levelStats.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { store } from "./store";
import {
  loadLevelStats,
  saveLevelStats,
  updateLevelRecord,
  mergeRemoteLevelStats,
  isLevelUnlocked,
} from "./levelStats";

beforeEach(() => {
  store.delTables();
});

describe("loadLevelStats", () => {
  it("returns empty object when nothing stored", () => {
    expect(loadLevelStats()).toEqual({});
  });

  it("returns stored stats", () => {
    store.setRow("levelStats", "1", { stars: 3, totalTime: 5000, completedAt: "2025-01-01T00:00:00.000Z" });
    expect(loadLevelStats()).toEqual({
      "1": { stars: 3, totalTime: 5000, completedAt: "2025-01-01T00:00:00.000Z" },
    });
  });
});

describe("saveLevelStats", () => {
  it("persists stats to the store", () => {
    const data = { "5": { stars: 2 as const, totalTime: 12000, completedAt: "2025-01-01T00:00:00.000Z" } };
    saveLevelStats(data);
    expect(store.getRow("levelStats", "5")).toEqual(data["5"]);
  });
});

describe("updateLevelRecord", () => {
  it("saves a record when none exists", () => {
    updateLevelRecord(1, { stars: 2, totalTime: 10000 });
    const stats = loadLevelStats();
    expect(stats["1"]?.stars).toBe(2);
    expect(stats["1"]?.totalTime).toBe(10000);
    expect(stats["1"]?.completedAt).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });

  it("overwrites when new run has more stars", () => {
    updateLevelRecord(1, { stars: 1, totalTime: 10000 });
    updateLevelRecord(1, { stars: 3, totalTime: 20000 });
    expect(loadLevelStats()["1"]?.stars).toBe(3);
  });

  it("overwrites when same stars but less time", () => {
    updateLevelRecord(1, { stars: 2, totalTime: 10000 });
    updateLevelRecord(1, { stars: 2, totalTime: 8000 });
    expect(loadLevelStats()["1"]?.totalTime).toBe(8000);
  });

  it("does not overwrite when fewer stars", () => {
    updateLevelRecord(1, { stars: 3, totalTime: 10000 });
    updateLevelRecord(1, { stars: 1, totalTime: 5000 });
    expect(loadLevelStats()["1"]?.stars).toBe(3);
  });

  it("does not overwrite when same stars but more time", () => {
    updateLevelRecord(1, { stars: 2, totalTime: 8000 });
    updateLevelRecord(1, { stars: 2, totalTime: 12000 });
    expect(loadLevelStats()["1"]?.totalTime).toBe(8000);
  });

  it("returns whether it was a new record", () => {
    expect(updateLevelRecord(1, { stars: 2, totalTime: 10000 })).toBe(true);
    expect(updateLevelRecord(1, { stars: 1, totalTime: 5000 })).toBe(false);
    expect(updateLevelRecord(1, { stars: 2, totalTime: 5000 })).toBe(true);
  });
});

describe("mergeRemoteLevelStats", () => {
  it("adopts remote records when nothing local exists", () => {
    mergeRemoteLevelStats({
      "1": { stars: 3, totalTime: 5000, completedAt: "2025-01-01T00:00:00.000Z" },
      "2": { stars: 1, totalTime: 9000, completedAt: "2025-01-01T00:00:00.000Z" },
    });
    const stats = loadLevelStats();
    expect(stats["1"]?.stars).toBe(3);
    expect(stats["2"]?.stars).toBe(1);
  });

  it("never downgrades a better local record", () => {
    updateLevelRecord(1, { stars: 3, totalTime: 5000 });
    mergeRemoteLevelStats({ "1": { stars: 1, totalTime: 20000, completedAt: "2025-01-01T00:00:00.000Z" } });
    expect(loadLevelStats()["1"]?.stars).toBe(3);
  });

  it("upgrades a worse local record", () => {
    updateLevelRecord(1, { stars: 1, totalTime: 20000 });
    mergeRemoteLevelStats({ "1": { stars: 3, totalTime: 5000, completedAt: "2025-01-01T00:00:00.000Z" } });
    expect(loadLevelStats()["1"]?.stars).toBe(3);
  });
});

describe("isLevelUnlocked", () => {
  it("level 1 is always unlocked", () => {
    expect(isLevelUnlocked(1, {})).toBe(true);
  });

  it("a level is locked when the previous one has no record", () => {
    expect(isLevelUnlocked(2, {})).toBe(false);
  });

  it("a level is locked when the previous one has zero stars", () => {
    const stats = { "1": { stars: 0 as const, totalTime: 5000, completedAt: "x" } };
    expect(isLevelUnlocked(2, stats)).toBe(false);
  });

  it("a level unlocks once the previous one has at least one star", () => {
    const stats = { "1": { stars: 1 as const, totalTime: 5000, completedAt: "x" } };
    expect(isLevelUnlocked(2, stats)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter frontend exec vitest run src/storage/levelStats.test.ts`
Expected: FAIL — `loadLevelStats`/etc. still read `localStorage`, so `store.setRow`-seeded data isn't visible to them yet.

- [ ] **Step 3: Rewrite `levelStats.ts`**

```ts
// apps/frontend/src/storage/levelStats.ts
import { isBetterLevelRecord } from "engine";
import { store } from "./store";

const TABLE = "levelStats";

export type LevelStats = {
  stars: 0 | 1 | 2 | 3;
  totalTime: number; // ms, sum of all trial times
  completedAt: string; // ISO date
};

export type PersistedLevelStats = Record<string, LevelStats>;

export function loadLevelStats(): PersistedLevelStats {
  const result: PersistedLevelStats = {};
  Object.entries(store.getTable(TABLE)).forEach(([levelNumber, row]) => {
    result[levelNumber] = row as LevelStats;
  });
  return result;
}

export function saveLevelStats(stats: PersistedLevelStats): void {
  Object.entries(stats).forEach(([levelNumber, levelStats]) => {
    store.setRow(TABLE, levelNumber, levelStats);
  });
}

/**
 * Update the stored record for a level if the new run is better.
 * Better means: more stars, or same stars with less total time.
 * Returns whether it was — the record must be read *before* this call
 * overwrites it, so this is the only point that can answer that.
 */
export function updateLevelRecord(
  levelNumber: number,
  run: { stars: 0 | 1 | 2 | 3; totalTime: number },
): boolean {
  const key = String(levelNumber);
  // getRow returns {} (truthy!) for a missing row, not undefined — hasRow
  // is the only reliable way to distinguish "no record yet" from a real one.
  const existing = store.hasRow(TABLE, key) ? (store.getRow(TABLE, key) as LevelStats) : undefined;

  const isNewRecord = isBetterLevelRecord(run, existing);
  if (!isNewRecord) return false;

  store.setRow(TABLE, key, {
    stars: run.stars,
    totalTime: run.totalTime,
    completedAt: new Date().toISOString(),
  });
  return true;
}

/** A Level unlocks once the previous one has been completed with at least one star. Level 1 is always open. */
export function isLevelUnlocked(levelNumber: number, stats: PersistedLevelStats): boolean {
  if (levelNumber === 1) return true;
  return (stats[String(levelNumber - 1)]?.stars ?? 0) > 0;
}

/**
 * Merge a remote LevelStats snapshot (fetched on login) into local storage.
 * Uses the same better-record comparison as updateLevelRecord, so a device
 * with a better local record is never downgraded by an older remote one.
 */
export function mergeRemoteLevelStats(remote: PersistedLevelStats): void {
  Object.entries(remote).forEach(([levelNumber, stats]) => {
    updateLevelRecord(Number(levelNumber), { stars: stats.stars, totalTime: stats.totalTime });
  });
}
```

Note what's gone: the `try/catch` around `localStorage` access (quota-exceeded, unavailable) is dropped — TinyBase's in-memory `Store` never throws on `getRow`/`setRow`, and IndexedDB write failures are the persister's concern (auto-save fire-and-forget, mirroring how `pushResults.ts` already treats network failures), not this module's.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter frontend exec vitest run src/storage/levelStats.test.ts`
Expected: PASS

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter frontend typecheck`
Expected: no new errors from this file (unrelated pre-existing errors, if any, are out of scope)

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/storage/levelStats.ts apps/frontend/src/storage/levelStats.test.ts
git commit -m "feat(frontend): back levelStats.ts with the TinyBase store"
```

---

### Task 3: Unified `trials` table for `trialHistory.ts` and `practiceHistory.ts`

**Files:**
- Modify: `apps/frontend/src/storage/trialHistory.ts`
- Modify: `apps/frontend/src/storage/trialHistory.test.ts`
- Modify: `apps/frontend/src/storage/practiceHistory.ts`
- Modify: `apps/frontend/src/storage/practiceHistory.test.ts`

**Interfaces:**
- Consumes: `store` from Task 1, `randomId` from `apps/frontend/src/randomId.ts` (existing).
- Produces: `PersistedTrial` and `PersistedPracticeTrial` both gain a `trialId: string` field. `buildPersistedTrials`/`buildPersistedPracticeTrials`/`loadTrialHistory`/`loadPracticeHistory`/`appendTrials`/`appendPracticeTrials` keep their existing signatures otherwise. Both modules read/write the same underlying `trials` table, discriminated by a `runType` cell (`"level"` / `"practice"`) — consumed directly by Task 4 (sync payloads read `t.trialId`).

- [ ] **Step 1: Rewrite `trialHistory.test.ts`**

```ts
// apps/frontend/src/storage/trialHistory.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { Addition } from "engine";
import { store } from "./store";
import { buildPersistedTrials, loadTrialHistory, appendTrials, type PersistedTrial } from "./trialHistory";
import type { GameConfig, TrialResult } from "../game/index";

beforeEach(() => {
  store.delTables();
});

const config: GameConfig = { levelNumber: 3, level: { "1d+1d": 1 }, totalTrials: 1 };

function fakeResult(overrides: Partial<TrialResult> = {}): TrialResult {
  const op = Addition.create({ type: "addition", codename: "1d+1d", lDigits: 1, rDigits: 1 });
  return {
    operation: op,
    answer: op.result(),
    correct: true,
    timeExceeded: false,
    timeTaken: 1000,
    keystrokes: [{ key: "9", t: 100 }],
    hintShown: false,
    hasErased: false,
    streakAtSubmit: 1,
    hintsAvailableAtStart: 3,
    ...overrides,
  };
}

describe("buildPersistedTrials", () => {
  it("stamps each trial with a fresh, distinct trialId", () => {
    const trials = buildPersistedTrials(config, [fakeResult(), fakeResult()], "run-1");
    expect(trials[0].trialId).toBeTruthy();
    expect(trials[1].trialId).toBeTruthy();
    expect(trials[0].trialId).not.toBe(trials[1].trialId);
  });
});

describe("appendTrials / loadTrialHistory", () => {
  it("round-trips a trial through the store", () => {
    const [trial] = buildPersistedTrials(config, [fakeResult()], "run-1");
    appendTrials([trial]);

    const history = loadTrialHistory();
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      levelNumber: 3,
      categoryCodename: "1d+1d",
      correct: true,
      runId: "run-1",
      trialId: trial.trialId,
    });
    expect(history[0].keystrokes).toEqual([{ key: "9", t: 100 }]);
  });

  it("does nothing for an empty batch", () => {
    appendTrials([]);
    expect(loadTrialHistory()).toHaveLength(0);
  });

  it("caps stored trials at 2000, evicting the oldest first", () => {
    const trials: PersistedTrial[] = Array.from({ length: 2005 }, (_, i) =>
      buildPersistedTrials(config, [fakeResult()], `run-${i}`)[0],
    );
    trials.forEach((t, i) => appendTrials([{ ...t, playedAt: new Date(1_700_000_000_000 + i).toISOString() }]));

    const history = loadTrialHistory();
    expect(history).toHaveLength(2000);
    expect(history[0].runId).toBe("run-5"); // the 5 oldest were evicted
  });
});
```

- [ ] **Step 2: Rewrite `practiceHistory.test.ts`**

```ts
// apps/frontend/src/storage/practiceHistory.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { Multiplication } from "engine";
import { store } from "./store";
import { buildPersistedPracticeTrials, loadPracticeHistory, appendPracticeTrials } from "./practiceHistory";
import type { BaseTrialResult } from "engine";

beforeEach(() => {
  store.delTables();
});

function fakeResult(overrides: Partial<BaseTrialResult> = {}): BaseTrialResult {
  const op = Multiplication.create({ type: "multiplication", codename: "1dx1d", lDigits: 1, rDigits: 1 });
  return {
    operation: op,
    answer: op.result(),
    correct: true,
    timeExceeded: false,
    timeTaken: 800,
    keystrokes: [{ key: "6", t: 50 }],
    hintShown: false,
    hasErased: false,
    ...overrides,
  };
}

describe("buildPersistedPracticeTrials", () => {
  it("stamps each trial with a fresh, distinct trialId", () => {
    const trials = buildPersistedPracticeTrials([fakeResult(), fakeResult()], "session-1");
    expect(trials[0].trialId).toBeTruthy();
    expect(trials[1].trialId).not.toBe(trials[0].trialId);
  });
});

describe("appendPracticeTrials / loadPracticeHistory", () => {
  it("round-trips a Practice trial through the store", () => {
    const [trial] = buildPersistedPracticeTrials([fakeResult()], "session-1");
    appendPracticeTrials([trial]);

    const history = loadPracticeHistory();
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      categoryCodename: "1dx1d",
      correct: true,
      runId: "session-1",
      trialId: trial.trialId,
    });
  });

  it("keeps Level and Practice histories independent", async () => {
    const { buildPersistedTrials, appendTrials } = await import("./trialHistory");
    const config = { levelNumber: 1, level: { "1d+1d": 1 }, totalTrials: 1 } as Parameters<typeof buildPersistedTrials>[0];
    const [levelTrial] = buildPersistedTrials(
      config,
      [{ operation: { categoryCodename: () => "1d+1d" }, correct: true, timeExceeded: false, timeTaken: 500, keystrokes: [], hintShown: false, streakAtSubmit: 0, hintsAvailableAtStart: 3, answer: 1 } as never],
      "run-x",
    );
    appendTrials([levelTrial]);

    const [practiceTrial] = buildPersistedPracticeTrials([fakeResult()], "session-1");
    appendPracticeTrials([practiceTrial]);

    expect(loadPracticeHistory()).toHaveLength(1);
    expect(loadPracticeHistory()[0].trialId).toBe(practiceTrial.trialId);
  });
});
```

- [ ] **Step 3: Run both to verify they fail**

Run: `pnpm --filter frontend exec vitest run src/storage/trialHistory.test.ts src/storage/practiceHistory.test.ts`
Expected: FAIL — `trialId` doesn't exist on either type yet, and both modules still read/write `localStorage`.

- [ ] **Step 4: Rewrite `trialHistory.ts`**

```ts
// apps/frontend/src/storage/trialHistory.ts
import type { GameConfig, TrialResult } from "../game/index";
import { computePlayedAtTimestamps } from "./playedAt";
import { randomId } from "../randomId";
import { store } from "./store";

const TABLE = "trials";
const MAX_TRIALS = 2000;

export type PersistedTrial = {
  trialId: string;
  levelNumber: number;
  categoryCodename: string;
  correct: boolean;
  timeExceeded: boolean;
  timeTaken: number;
  playedAt: string; // ISO date
  keystrokes: { key: string; t: number }[];
  hintShown: boolean;
  streakAtSubmit: number;
  hintsAvailableAtStart: number;
  /** Identifies which single playthrough this trial belongs to — see Playing/Finished's runId. */
  runId: string;
};

/** Map a finished level's trial results into the shape persisted to trial history. */
export function buildPersistedTrials(
  config: GameConfig,
  results: TrialResult[],
  runId: string,
): PersistedTrial[] {
  const playedAtTimestamps = computePlayedAtTimestamps(
    results.map((r) => r.timeTaken),
    Date.now(),
  );
  return results.map((r, i) => ({
    trialId: randomId(),
    levelNumber: config.levelNumber,
    categoryCodename: r.operation.categoryCodename(),
    correct: r.correct,
    timeExceeded: r.timeExceeded,
    timeTaken: r.timeTaken,
    playedAt: new Date(playedAtTimestamps[i]).toISOString(),
    keystrokes: r.keystrokes,
    hintShown: r.hintShown,
    streakAtSubmit: r.streakAtSubmit,
    hintsAvailableAtStart: r.hintsAvailableAtStart,
    runId,
  }));
}

export function loadTrialHistory(): PersistedTrial[] {
  return store
    .getSortedRowIds(TABLE, "playedAt")
    .map((rowId) => store.getRow(TABLE, rowId))
    .filter((row) => row.runType === "level")
    .map((row) => ({
      trialId: row.trialId as string,
      levelNumber: row.levelNumber as number,
      categoryCodename: row.categoryCodename as string,
      correct: row.correct as boolean,
      timeExceeded: row.timeExceeded as boolean,
      timeTaken: row.timeTaken as number,
      playedAt: row.playedAt as string,
      keystrokes: JSON.parse(row.keystrokesJson as string),
      hintShown: row.hintShown as boolean,
      streakAtSubmit: row.streakAtSubmit as number,
      hintsAvailableAtStart: row.hintsAvailableAtStart as number,
      runId: row.runId as string,
    }));
}

export function appendTrials(trials: PersistedTrial[]): void {
  if (trials.length === 0) return;
  trials.forEach((t) => {
    store.setRow(TABLE, t.trialId, {
      trialId: t.trialId,
      runType: "level",
      levelNumber: t.levelNumber,
      categoryCodename: t.categoryCodename,
      correct: t.correct,
      timeExceeded: t.timeExceeded,
      timeTaken: t.timeTaken,
      playedAt: t.playedAt,
      keystrokesJson: JSON.stringify(t.keystrokes),
      hintShown: t.hintShown,
      streakAtSubmit: t.streakAtSubmit,
      hintsAvailableAtStart: t.hintsAvailableAtStart,
      runId: t.runId,
    });
  });
  evictOldest("level", MAX_TRIALS);
}

/** Deletes the oldest rows of the given runType beyond `max`, oldest (by playedAt) first. */
function evictOldest(runType: "level" | "practice", max: number): void {
  const ids = store
    .getSortedRowIds(TABLE, "playedAt")
    .filter((rowId) => store.getCell(TABLE, rowId, "runType") === runType);
  const excess = ids.length - max;
  if (excess <= 0) return;
  ids.slice(0, excess).forEach((rowId) => store.delRow(TABLE, rowId));
}
```

- [ ] **Step 5: Rewrite `practiceHistory.ts`**

```ts
// apps/frontend/src/storage/practiceHistory.ts
import type { BaseTrialResult } from "engine";
import { computePlayedAtTimestamps } from "./playedAt";
import { randomId } from "../randomId";
import { store } from "./store";

const TABLE = "trials";
const MAX_TRIALS = 2000;

// No levelNumber — Practice trials aren't tied to a Level. Kept as a
// separate type from Level's PersistedTrial (storage/trialHistory.ts) per
// the grilling session: Practice and Level stats stay unmerged — even
// though, as of this change, both now live in the same underlying table.
export type PersistedPracticeTrial = {
  trialId: string;
  categoryCodename: string;
  correct: boolean;
  timeExceeded: boolean;
  timeTaken: number;
  playedAt: string; // ISO date
  keystrokes: { key: string; t: number }[];
  hintShown: boolean;
  /** Identifies which single Practice session this trial belongs to — see PracticeStopped's runId. */
  runId: string;
};

/** Map a stopped Practice session's trial results into the shape persisted to Practice history. */
export function buildPersistedPracticeTrials(
  results: BaseTrialResult[],
  runId: string,
): PersistedPracticeTrial[] {
  const playedAtTimestamps = computePlayedAtTimestamps(
    results.map((r) => r.timeTaken),
    Date.now(),
  );
  return results.map((r, i) => ({
    trialId: randomId(),
    categoryCodename: r.operation.categoryCodename(),
    correct: r.correct,
    timeExceeded: r.timeExceeded,
    timeTaken: r.timeTaken,
    playedAt: new Date(playedAtTimestamps[i]).toISOString(),
    keystrokes: r.keystrokes,
    hintShown: r.hintShown,
    runId,
  }));
}

export function loadPracticeHistory(): PersistedPracticeTrial[] {
  return store
    .getSortedRowIds(TABLE, "playedAt")
    .map((rowId) => store.getRow(TABLE, rowId))
    .filter((row) => row.runType === "practice")
    .map((row) => ({
      trialId: row.trialId as string,
      categoryCodename: row.categoryCodename as string,
      correct: row.correct as boolean,
      timeExceeded: row.timeExceeded as boolean,
      timeTaken: row.timeTaken as number,
      playedAt: row.playedAt as string,
      keystrokes: JSON.parse(row.keystrokesJson as string),
      hintShown: row.hintShown as boolean,
      runId: row.runId as string,
    }));
}

export function appendPracticeTrials(trials: PersistedPracticeTrial[]): void {
  if (trials.length === 0) return;
  trials.forEach((t) => {
    store.setRow(TABLE, t.trialId, {
      trialId: t.trialId,
      runType: "practice",
      categoryCodename: t.categoryCodename,
      correct: t.correct,
      timeExceeded: t.timeExceeded,
      timeTaken: t.timeTaken,
      playedAt: t.playedAt,
      keystrokesJson: JSON.stringify(t.keystrokes),
      hintShown: t.hintShown,
      runId: t.runId,
    });
  });
  evictOldestPractice(MAX_TRIALS);
}

function evictOldestPractice(max: number): void {
  const ids = store
    .getSortedRowIds(TABLE, "playedAt")
    .filter((rowId) => store.getCell(TABLE, rowId, "runType") === "practice");
  const excess = ids.length - max;
  if (excess <= 0) return;
  ids.slice(0, excess).forEach((rowId) => store.delRow(TABLE, rowId));
}
```

- [ ] **Step 6: Run both to verify they pass**

Run: `pnpm --filter frontend exec vitest run src/storage/trialHistory.test.ts src/storage/practiceHistory.test.ts`
Expected: PASS

- [ ] **Step 7: Typecheck**

Run: `pnpm --filter frontend typecheck`
Expected: no new errors

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/src/storage/trialHistory.ts apps/frontend/src/storage/trialHistory.test.ts apps/frontend/src/storage/practiceHistory.ts apps/frontend/src/storage/practiceHistory.test.ts
git commit -m "feat(frontend): unify Level/Practice trial storage into one TinyBase table"
```

---

### Task 4: Thread `trialId` into the sync payload

**Files:**
- Modify: `apps/frontend/src/api/Api.ts`
- Modify: `apps/frontend/src/sync/pushResults.ts`
- Modify: `apps/frontend/src/sync/pushResults.test.ts`
- Modify: `apps/frontend/src/sync/pushPracticeResults.ts`
- Modify: `apps/frontend/src/sync/pushPracticeResults.test.ts`

**Interfaces:**
- Consumes: `PersistedTrial.trialId` / `PersistedPracticeTrial.trialId` from Task 3.
- Produces: `SyncTrial.trialId?: string` — the backend (PR #36, already merged into this branch) reads it as the retry-dedup key.

- [ ] **Step 1: Add `trialId` to `SyncTrial`**

In `apps/frontend/src/api/Api.ts`, find `export type SyncTrial = { ... }` and add:

```ts
export type SyncTrial = {
  runType: "level" | "practice";
  levelNumber: number | null;
  categoryCodename: string;
  correct: boolean;
  timeExceeded: boolean;
  timeTaken: number;
  playedAt: number; // epoch ms
  keystrokes: Keystroke[];
  operands: number[];
  answer: number | null;
  hintShown: boolean;
  streakAtSubmit: number;
  hintsAvailableAtStart: number;
  runId: string;
  trialId?: string;
};
```

- [ ] **Step 2: Add `trialId` to `pushResults.test.ts`'s fixture and expected payload**

In `apps/frontend/src/sync/pushResults.test.ts`, add `trialId: "trial-abc"` to `makeTrial`'s default fields:

```ts
function makeTrial(overrides: Partial<PersistedTrial> = {}): PersistedTrial {
  return {
    trialId: "trial-abc",
    levelNumber: 3,
    categoryCodename: "1d+1d",
    correct: true,
    timeExceeded: false,
    timeTaken: 1200,
    playedAt: "2026-01-01T00:00:00.000Z",
    keystrokes: [{ key: "1", t: 100 }],
    hintShown: false,
    streakAtSubmit: 0,
    hintsAvailableAtStart: 3,
    runId: "run-abc",
    ...overrides,
  };
}
```

and `trialId: "trial-abc"` to the expected payload object in `"builds the wire payload and calls Api.syncResults"`:

```ts
    expect(Api.syncResults).toHaveBeenCalledWith("tok", [
      {
        runType: "level",
        levelNumber: 3,
        categoryCodename: "1d+1d",
        correct: true,
        timeExceeded: false,
        timeTaken: 1200,
        playedAt: new Date("2026-01-01T00:00:00.000Z").getTime(),
        keystrokes: [{ key: "1", t: 100 }],
        operands: result.operation.operands(),
        answer: result.answer,
        hintShown: false,
        streakAtSubmit: 0,
        hintsAvailableAtStart: 3,
        runId: "run-abc",
        trialId: "trial-abc",
      },
    ]);
```

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm --filter frontend exec vitest run src/sync/pushResults.test.ts`
Expected: FAIL — `trialId` doesn't exist on `PersistedTrial` yet (typecheck), and the actual payload lacks it.

- [ ] **Step 4: Update `pushResults.ts`**

In `apps/frontend/src/sync/pushResults.ts`, add one line to the payload mapping:

```ts
const payload: SyncTrial[] = trials.map((t, i) => ({
  runType: "level",
  levelNumber: t.levelNumber,
  categoryCodename: t.categoryCodename,
  correct: t.correct,
  timeExceeded: t.timeExceeded,
  timeTaken: t.timeTaken,
  playedAt: new Date(t.playedAt).getTime(),
  keystrokes: t.keystrokes,
  operands: results[i].operation.operands(),
  answer: results[i].answer,
  hintShown: t.hintShown,
  streakAtSubmit: t.streakAtSubmit,
  hintsAvailableAtStart: t.hintsAvailableAtStart,
  runId: t.runId,
  trialId: t.trialId,
}));
```

- [ ] **Step 5: Same for `pushPracticeResults.test.ts`**

In `apps/frontend/src/sync/pushPracticeResults.test.ts`, add `trialId: "practice-trial-abc"` to `makeTrial`'s default fields:

```ts
function makeTrial(overrides: Partial<PersistedPracticeTrial> = {}): PersistedPracticeTrial {
  return {
    trialId: "practice-trial-abc",
    categoryCodename: "1d+1d",
    correct: true,
    timeExceeded: false,
    timeTaken: 800,
    playedAt: "2026-01-01T00:00:00.000Z",
    keystrokes: [{ key: "1", t: 50 }],
    hintShown: false,
    runId: "practice-run-abc",
    ...overrides,
  };
}
```

and `trialId: "practice-trial-abc"` to the expected payload object in `"builds the wire payload with runType practice and a null levelNumber"`:

```ts
    expect(Api.syncResults).toHaveBeenCalledWith("tok", [
      {
        runType: "practice",
        levelNumber: null,
        categoryCodename: "1d+1d",
        correct: true,
        timeExceeded: false,
        timeTaken: 800,
        playedAt: new Date("2026-01-01T00:00:00.000Z").getTime(),
        keystrokes: [{ key: "1", t: 50 }],
        operands: result.operation.operands(),
        answer: result.answer,
        hintShown: false,
        streakAtSubmit: 0,
        hintsAvailableAtStart: 0,
        runId: "practice-run-abc",
        trialId: "practice-trial-abc",
      },
    ]);
```

The other two tests in that file (`"computes streakAtSubmit retroactively..."` and `"is fire-and-forget..."`) use `makeTrial()`'s default via the map/spread shown above, so they pick up `trialId: "practice-trial-abc"` automatically — no further changes needed there.

- [ ] **Step 6: Update `pushPracticeResults.ts`**

In `apps/frontend/src/sync/pushPracticeResults.ts`, add one line to the payload mapping:

```ts
const payload: SyncTrial[] = trials.map((t, i) => ({
  runType: "practice",
  levelNumber: null,
  categoryCodename: t.categoryCodename,
  correct: t.correct,
  timeExceeded: t.timeExceeded,
  timeTaken: t.timeTaken,
  playedAt: new Date(t.playedAt).getTime(),
  keystrokes: t.keystrokes,
  operands: results[i].operation.operands(),
  answer: results[i].answer,
  hintShown: t.hintShown,
  streakAtSubmit: currentStreak(results.slice(0, i)),
  hintsAvailableAtStart: 0,
  runId: t.runId,
  trialId: t.trialId,
}));
```

- [ ] **Step 7: Run both to verify they pass**

Run: `pnpm --filter frontend exec vitest run src/sync/pushResults.test.ts src/sync/pushPracticeResults.test.ts`
Expected: PASS

- [ ] **Step 8: Typecheck**

Run: `pnpm --filter frontend typecheck`
Expected: no new errors

- [ ] **Step 9: Commit**

```bash
git add apps/frontend/src/api/Api.ts apps/frontend/src/sync/pushResults.ts apps/frontend/src/sync/pushResults.test.ts apps/frontend/src/sync/pushPracticeResults.ts apps/frontend/src/sync/pushPracticeResults.test.ts
git commit -m "feat(frontend): send trialId in the sync payload"
```

---

### Task 5: Gate the three UI consumers on storage readiness

**Files:**
- Modify: `apps/frontend/src/components/LevelsList.tsx`
- Modify: `apps/frontend/src/components/LevelPlay.tsx`
- Modify: `apps/frontend/src/components/StatsScreen.tsx`

**Interfaces:**
- Consumes: `useStorage` from `storage/storageStore.ts` (Task 1).
- Produces: no exported-interface change — internal effect-timing fix only.

- [ ] **Step 1: `LevelsList.tsx` — extend the existing loading state**

Current code (`apps/frontend/src/components/LevelsList.tsx:42-47`):

```tsx
export function LevelsList() {
  const [stats, setStats] = useState<PersistedLevelStats>({});

  useEffect(() => {
    setStats(loadLevelStats());
  }, []);
```

Change to:

```tsx
import { useStorage } from "@/storage/storageStore";

export function LevelsList() {
  const [stats, setStats] = useState<PersistedLevelStats>({});
  const storageReady = useStorage((s) => s.ready);

  useEffect(() => {
    if (!storageReady) return;
    setStats(loadLevelStats());
  }, [storageReady]);
```

Then extend the existing loading-state check further down (`{isLoading && <p>...`) to also cover `!storageReady`:

```tsx
{(isLoading || !storageReady) && (
  <p className="text-center text-sm text-muted py-8">Loading levels…</p>
)}
```

and gate the `levelKeys && (...)` results block the same way it already gates on `levelKeys` — add `storageReady &&` to that condition too, so the level rows never render (correctly-locked or not) before stats are trustworthy:

```tsx
{levelKeys && storageReady && (
```

- [ ] **Step 2: `LevelPlay.tsx` — don't redirect before storage is ready**

Current code (`apps/frontend/src/components/LevelPlay.tsx:43-47`):

```tsx
useEffect(() => {
  if (!isLevelUnlocked(levelNumber, loadLevelStats())) {
    router.replace("/");
    return;
  }
```

Change to:

```tsx
import { useStorage } from "@/storage/storageStore";

// ... inside the component:
const storageReady = useStorage((s) => s.ready);

useEffect(() => {
  if (!storageReady) return; // don't judge "locked" before local data has loaded
  if (!isLevelUnlocked(levelNumber, loadLevelStats())) {
    router.replace("/");
    return;
  }
```

and add `storageReady` to that effect's dependency array (`[levelNumber, level, load, router]` → `[levelNumber, level, load, router, storageReady]`), so the check actually re-runs once storage flips ready (today's effect only runs once per `levelNumber`/`level` change — without this it would never re-check).

- [ ] **Step 3: `StatsScreen.tsx` — gate the history load**

Current code (`apps/frontend/src/components/StatsScreen.tsx:49-52`):

```tsx
useEffect(() => {
  setLevelTrials(loadTrialHistory());
  setPracticeTrials(loadPracticeHistory());
}, []);
```

Change to:

```tsx
import { useStorage } from "@/storage/storageStore";

// ... inside the component:
const storageReady = useStorage((s) => s.ready);

useEffect(() => {
  if (!storageReady) return;
  setLevelTrials(loadTrialHistory());
  setPracticeTrials(loadPracticeHistory());
}, [storageReady]);
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter frontend typecheck`
Expected: no new errors

- [ ] **Step 5: Run the full frontend suite**

Run: `pnpm --filter frontend test:run`
Expected: PASS (existing component tests for these three files, if any, should still pass — `storageReady` defaults to `false` in a fresh `storageStore`, so any test rendering these components needs `storageStore.setState({ ready: true })` in its setup if it currently asserts on stats-derived content; check each file's existing tests and add that one line if a test starts failing here)

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/components/LevelsList.tsx apps/frontend/src/components/LevelPlay.tsx apps/frontend/src/components/StatsScreen.tsx
git commit -m "feat(frontend): wait for TinyBase's initial load before reading local stats"
```

---

## Self-Review Notes

- **Spec coverage**: unified local storage table (per user decision), `trialId` stamping + wire threading, and storage-readiness gating (per user decision, implemented via a Zustand flag + per-component effect gating rather than a global blocking render, since `LevelPlay`'s redirect guard is a correctness issue, not just a cosmetic one — see conversation) are all covered. The TinyQL/`level_stats`-as-query redesign and the actual sync engine (durable queue, `GET /sync/pull` integration) are explicitly deferred to a separate plan.
- **Type consistency**: `PersistedTrial`/`PersistedPracticeTrial` both gain `trialId: string` (Task 3); `SyncTrial` gains the matching optional field (Task 4); every `row.foo as T` cast in the read functions matches exactly what `setRow` writes in the corresponding write function — checked field-by-field.
- **No placeholders**: every step has real, runnable code; `evictOldest`/`evictOldestPractice` are fully implemented, not stubbed.
