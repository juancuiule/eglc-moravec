import { beforeEach, expect, test } from "vitest";
import { screen, within } from "@testing-library/react";
import { PracticeModeSelection } from "./PracticeModeSelection";
import { localStore, TRIALS_TABLE } from "@/local/store";
import { renderWithIntl as render } from "@/testUtils/renderWithIntl";
import { FOCUS_BADGE_MIN_TRIALS } from "@/practice/focus";

function seedTrials(codename: string, correct: boolean, count: number) {
  for (let i = 0; i < count; i++) {
    localStore.setRow(TRIALS_TABLE, `t:${codename}-${correct}-${i}`, {
      categoryCodename: codename,
      operands: "[1,1]",
      timeTaken: 1000,
      playedAt: 1_700_000_000_000 + i,
      hintShown: false,
      runType: "practice",
      runId: "run-seed",
      synced: true,
      correct,
      timeExceeded: false,
    });
  }
}

beforeEach(() => {
  localStore.delTable(TRIALS_TABLE);
  localStore.setValue("hydrated", true);
});

test("offers the adaptive Focus session, linking to /practice/focus", () => {
  render(<PracticeModeSelection />);

  const focus = screen.getByRole("link", { name: /Focus/ });
  expect(focus.getAttribute("href")).toBe("/practice/focus");
});

test("no Recommended badge with an empty history", () => {
  render(<PracticeModeSelection />);
  expect(screen.queryByText("Recommended")).toBeNull();
});

test("no badge when the weakest category is under the minimum sample", () => {
  seedTrials("1dx1d", false, FOCUS_BADGE_MIN_TRIALS - 1);
  render(<PracticeModeSelection />);
  expect(screen.queryByText("Recommended")).toBeNull();
});

test("badges the lowest-effectiveness category once it has enough Trials", () => {
  seedTrials("1dx1d", false, FOCUS_BADGE_MIN_TRIALS + 1); // 0% — weakest
  seedTrials("1d+1d", true, 10);

  render(<PracticeModeSelection />);

  const weakTile = screen.getByRole("link", { name: /1d × 1d/ });
  expect(within(weakTile).getByText("Recommended")).toBeDefined();
  const strongTile = screen.getByRole("link", { name: /1d \+ 1d/ });
  expect(within(strongTile).queryByText("Recommended")).toBeNull();
});
