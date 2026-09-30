import { authStore } from "@/auth/store";
import { gameStore } from "@/game/store";
import { act } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/api/Api", () => ({
  Api: {
    fetchLevelStats: vi.fn().mockResolvedValue({}),
    sync: vi.fn().mockResolvedValue({ cursor: 0, trials: [] }),
    fetchAllLevels: vi.fn().mockResolvedValue([]),
  },
}));

import { LocalLevelPlay } from "./LocalLevelPlay";
import { localStore, TRIALS_TABLE } from "@/local/store";
import {
  LEVEL_NUMBERS_VALUE,
  LEVELS_TABLE,
  refreshLevelCatalog,
} from "@/local/levels";
import { mergeServerTrials } from "@/local/trials";
import { syncStatus } from "@/local/syncEngine";
import { Api } from "@/api/Api";
import { TRIALS_PER_LEVEL } from "engine";
import { renderWithIntl } from "@/testUtils/renderWithIntl";

// Seed the catalog snapshot the way a settled sync pass does.
async function seedCatalog(
  levels: { levelNumber: number; mix: Record<string, number> }[],
) {
  vi.mocked(Api.fetchAllLevels).mockResolvedValue(levels);
  await refreshLevelCatalog();
}

beforeEach(() => {
  vi.clearAllMocks();
  localStore.delTable(TRIALS_TABLE);
  localStore.delTable(LEVELS_TABLE);
  localStore.delValue(LEVEL_NUMBERS_VALUE);
  localStore.setValue("hydrated", true);
  syncStatus.setState({ pullSettledToken: "test-token" });
  gameStore.getState().reset();
  authStore.setState({ state: { type: "anonymous", token: "test-token" } });
});

test("renders the play screen from the cached mix when the backend is unreachable", async () => {
  await seedCatalog([
    { levelNumber: 1, mix: { "1d+1d": 100 } },
    { levelNumber: 2, mix: { "1dx1d": 100 } },
  ]);

  renderWithIntl(<LocalLevelPlay levelNumber={1} />);

  const state = gameStore.getState().state;
  expect(state.type).toBe("playing");
  if (state.type === "playing") expect(state.config.levelNumber).toBe(1);
});

test("a level dropped from the catalog still plays from its cached mix", async () => {
  // Cached before the catalog dropped it: the row survives refreshes and
  // stays playable — it just has no "next level". Level 2 needs level 1
  // completed to unlock, so seed that history first.
  const runId = crypto.randomUUID();
  mergeServerTrials(
    Array.from({ length: TRIALS_PER_LEVEL }, (_, i) => ({
      id: crypto.randomUUID(),
      runId,
      runType: "level" as const,
      categoryCodename: "1d+1d",
      levelNumber: 1,
      operands: [1, 2],
      answer: 3,
      correct: true,
      timeExceeded: false,
      timeTaken: 100,
      hintShown: false,
      playedAt: 1_700_000_000_000 + i * 100,
    })),
  );
  await seedCatalog([
    { levelNumber: 1, mix: { "1d+1d": 100 } },
    { levelNumber: 2, mix: { "1dx1d": 100 } },
  ]);
  await seedCatalog([{ levelNumber: 1, mix: { "1d+1d": 100 } }]);
  expect(localStore.getValue(LEVEL_NUMBERS_VALUE)).toBe("[1]");

  renderWithIntl(<LocalLevelPlay levelNumber={2} />);

  const state = gameStore.getState().state;
  expect(state.type).toBe("playing");
  if (state.type === "playing") expect(state.config.levelNumber).toBe(2);
});

test("shows the offline notice when the level was never cached", async () => {
  await seedCatalog([{ levelNumber: 1, mix: { "1d+1d": 100 } }]);

  const { getByText } = renderWithIntl(<LocalLevelPlay levelNumber={9} />);

  expect(getByText("You're offline")).toBeDefined();
  expect(gameStore.getState().state.type).toBe("idle");
});

test("shows the loading panel until the local store is hydrated", async () => {
  await seedCatalog([{ levelNumber: 1, mix: { "1d+1d": 100 } }]);
  act(() => {
    localStore.setValue("hydrated", false);
  });

  const { getByText } = renderWithIntl(<LocalLevelPlay levelNumber={1} />);
  expect(getByText("Loading level…")).toBeDefined();
  expect(gameStore.getState().state.type).toBe("idle");

  act(() => {
    localStore.setValue("hydrated", true);
  });
  expect(gameStore.getState().state.type).toBe("playing");
});
