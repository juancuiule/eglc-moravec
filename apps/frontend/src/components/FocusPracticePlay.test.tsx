import { beforeEach, expect, test, vi } from "vitest";
import { screen } from "@testing-library/react";
import { FocusPracticePlay } from "./FocusPracticePlay";
import { practiceStore } from "@/practice/store";
import { localStore, TRIALS_TABLE } from "@/local/store";
import { renderWithIntl as render } from "@/testUtils/renderWithIntl";

const { persistStoppedPractice } = vi.hoisted(() => ({
  persistStoppedPractice: vi.fn(),
}));
vi.mock("@/practice/persistStoppedPractice", () => ({
  persistStoppedPractice,
}));

// PracticeSummary (rendered on stop) uses next/navigation's useRouter.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

// Practice rows in the read model — the stats aggregation only reads
// categoryCodename/correct.
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

function playingFocusConfig() {
  const state = practiceStore.getState().state;
  if (state.type !== "playing") throw new Error("expected a playing session");
  if (state.config.mode !== "focus") {
    throw new Error("expected a Focus config");
  }
  return state.config; // narrowed to the focus variant
}

beforeEach(() => {
  localStore.delTable(TRIALS_TABLE);
  localStore.setValue("hydrated", true);
  practiceStore.getState().reset();
  persistStoppedPractice.mockClear();
});

test("starts a Focus session weighted toward the weakest local category", () => {
  seedTrials("1dx1d", false, 10); // all missed — the weak spot
  seedTrials("1d+1d", true, 10); // mastered

  render(<FocusPracticePlay />);

  const { weights } = playingFocusConfig();
  expect(weights["1dx1d"]).toBeGreaterThan(weights["1d+1d"]);
  expect(persistStoppedPractice).not.toHaveBeenCalled();
});

test("cold start — no local history — still starts a uniformly-weighted session", () => {
  render(<FocusPracticePlay />);

  const { weights } = playingFocusConfig();
  expect(new Set(Object.values(weights)).size).toBe(1);
});

test("holds on the loading panel while the local store is still hydrating", () => {
  localStore.setValue("hydrated", false);

  render(<FocusPracticePlay />);

  expect(screen.getByText("Loading practice…")).toBeDefined();
  expect(practiceStore.getState().state.type).toBe("idle");
});
