import { act, fireEvent, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { FocusPracticePlay } from "./FocusPracticePlay";
import { practiceStore } from "@/practice/store";
import { localStore, TRIALS_TABLE } from "@/local/store";
import { authStore } from "@/auth/store";
import { syncStatus } from "@/local/syncEngine";
import { renderWithIntl as render } from "@/testUtils/renderWithIntl";

// Rows are written as each Trial is scored; stopping only kicks the push.
const { kickSync } = vi.hoisted(() => ({ kickSync: vi.fn() }));
vi.mock("@/local/syncEngine", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/local/syncEngine")>()),
  kickSync,
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
  kickSync.mockClear();
  // The first-pull gate is token-scoped — settle it for this session.
  authStore.setState({ state: { type: "anonymous", token: "test-token" } });
  syncStatus.setState({ pullSettledToken: "test-token" });
});

test("starts a Focus session weighted toward the weakest local category", () => {
  seedTrials("1dx1d", false, 10); // all missed — the weak spot
  seedTrials("1d+1d", true, 10); // mastered

  render(<FocusPracticePlay />);

  const { weights } = playingFocusConfig();
  expect(weights["1dx1d"]).toBeGreaterThan(weights["1d+1d"]);
  expect(kickSync).not.toHaveBeenCalled();
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

test("waits for the first pull to settle — a fresh device's incoming history shapes the weights", () => {
  seedTrials("1dx1d", false, 10); // arrived via the account pull
  syncStatus.setState({ pullSettledToken: null });

  render(<FocusPracticePlay />);
  expect(practiceStore.getState().state.type).toBe("idle");

  act(() => syncStatus.setState({ pullSettledToken: "test-token" }));

  const { weights } = playingFocusConfig();
  expect(weights["1dx1d"]).toBeGreaterThan(weights["1d+1d"]);
});

test("Practice again re-derives weights — the just-stopped run's Trials shift the mix", () => {
  seedTrials("1dx1d", false, 10);
  seedTrials("1d+1d", true, 10);
  render(<FocusPracticePlay />);
  const firstWeight = playingFocusConfig().weights["1dx1d"];

  act(() => practiceStore.getState().stop());
  // Emulate a run's worth of correct answers landing in the read model.
  seedTrials("1dx1d", true, 40);

  fireEvent.click(screen.getByRole("button", { name: "Practice again" }));

  const { weights } = playingFocusConfig();
  expect(weights["1dx1d"]).toBeLessThan(firstWeight);
});
