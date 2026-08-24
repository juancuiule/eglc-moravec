import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { getRxStorageMemory } from "rxdb/plugins/storage-memory";
import { RxDatabaseProvider } from "rxdb/plugins/react";
import { LevelPlay } from "./LevelPlay";
import { createAppDatabase, type AppDatabase } from "@/db/database";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

const load = vi.fn();
const reset = vi.fn();
const gameState: { type: string } = { type: "loading" };
vi.mock("@/game/store", () => ({
  gameStore: {
    getState: () => ({ state: gameState, reset }),
    subscribe: () => () => {},
  },
  useGame: (selector: (s: { state: typeof gameState; load: typeof load }) => unknown) =>
    selector({ state: gameState, load }),
}));

// Level 1 is always unlocked (see isLevelUnlocked) — keeps these tests from
// needing to stub localStorage-backed LevelStats just to reach the code
// under test.
const LEVEL_NUMBER = 1;

let db: AppDatabase;

beforeEach(async () => {
  replace.mockClear();
  load.mockClear();
  reset.mockClear();
  gameState.type = "loading";
  vi.spyOn(console, "warn").mockImplementation(() => {});
  db = await createAppDatabase(getRxStorageMemory(), `test-levelplay-${Math.random().toString(36).slice(2)}`);
});

afterEach(async () => {
  await db.close();
});

function renderWithDatabase(props: { levelNumber: number; level: Record<string, number> | null }) {
  return render(
    <RxDatabaseProvider database={db}>
      <LevelPlay levelNumber={props.levelNumber} level={props.level} />
    </RxDatabaseProvider>,
  );
}

test("loads the live-fetched Level directly when the backend was reachable", async () => {
  renderWithDatabase({ levelNumber: LEVEL_NUMBER, level: { "1d+1d": 100 } });

  await waitFor(() => expect(load).toHaveBeenCalledWith({
    levelNumber: LEVEL_NUMBER,
    level: { "1d+1d": 100 },
    totalTrials: expect.any(Number),
  }));
  expect(console.warn).not.toHaveBeenCalled();
});

test("falls back to the locally-replicated Level, with a console warning, when the live fetch failed", async () => {
  await db.levels.insert({ levelNumber: String(LEVEL_NUMBER), mix: { "2dx1d": 100 } });

  renderWithDatabase({ levelNumber: LEVEL_NUMBER, level: null });

  await waitFor(() => expect(load).toHaveBeenCalledWith({
    levelNumber: LEVEL_NUMBER,
    level: { "2dx1d": 100 },
    totalTrials: expect.any(Number),
  }));
  expect(console.warn).toHaveBeenCalledWith(expect.stringContaining(`Level ${LEVEL_NUMBER}`));
});

test("shows an unavailable message, and never calls load, when neither the live fetch nor the local replica has the Level", async () => {
  renderWithDatabase({ levelNumber: LEVEL_NUMBER, level: null });

  expect(await screen.findByText(/isn't available offline/)).toBeDefined();
  expect(load).not.toHaveBeenCalled();
});

test("never loads a locked Level, even though router.replace() doesn't unmount the page synchronously", async () => {
  // Level 2 with no LevelStats recorded is locked (see isLevelUnlocked) —
  // unlike level 1, which every other test in this file uses specifically
  // because it's always unlocked.
  const LOCKED_LEVEL = 2;

  renderWithDatabase({ levelNumber: LOCKED_LEVEL, level: { "1d+1d": 100 } });

  await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
  expect(load).not.toHaveBeenCalled();
});
