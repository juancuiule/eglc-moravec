import { screen } from "@testing-library/react";
import { beforeEach, expect, test } from "vitest";
import { LevelsList } from "./LevelsList";
import type { SyncedTrial } from "@/api/Api";
import { localStore, TRIALS_TABLE } from "@/local/store";
import { mergeServerTrials } from "@/local/trials";
import { renderWithIntl as render } from "@/testUtils/renderWithIntl";

// Seed a completed Level run in the local store — 20 correct trials under
// one runId is a 3-star record by the engine's own derivation.
function seedLevelRun(levelNumber: number) {
  const runId = crypto.randomUUID();
  const trials: SyncedTrial[] = Array.from({ length: 20 }, (_, i) => ({
    id: crypto.randomUUID(),
    runId,
    runType: "level",
    categoryCodename: "1dx1d",
    levelNumber,
    operands: [2, 3],
    answer: 6,
    correct: true,
    timeExceeded: false,
    timeTaken: 500,
    hintShown: false,
    playedAt: 1_700_000_000_000 + i * 500,
  }));
  mergeServerTrials(trials);
}

beforeEach(() => {
  localStore.delTable(TRIALS_TABLE);
  localStore.setValue("hydrated", true);
});

test("level 1 is unlocked and links to play; level 2 is locked (level 1 has no stars), not a link", async () => {
  render(<LevelsList levelKeys={[1, 2, 3]} />);

  const level1 = await screen.findByRole("link", { name: /Level 1/ });
  expect(level1.getAttribute("href")).toBe("/level/1");

  const level2Row = screen.getByText("Level 2").closest("a, div");
  expect(level2Row?.tagName).toBe("DIV");
  expect(screen.getByText("Level 2").closest("a")).toBeNull();
});

test("level 2 unlocks once level 1 has a locally-stored run — synced or not", async () => {
  seedLevelRun(1);
  render(<LevelsList levelKeys={[1, 2, 3]} />);

  const level2 = await screen.findByRole("link", { name: /Level 2/ });
  expect(level2.getAttribute("href")).toBe("/level/2");
});
