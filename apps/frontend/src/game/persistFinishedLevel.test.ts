import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../storage/levelStats", () => ({
  updateLevelRecord: vi.fn(),
}));

vi.mock("../storage/trialHistory", () => ({
  appendTrials: vi.fn(),
  buildPersistedTrials: vi.fn(() => [{ fake: "persisted-trial" }]),
}));

vi.mock("../sync/pushResults", () => ({
  pushResults: vi.fn(),
}));

import { persistFinishedLevel } from "./persistFinishedLevel";
import { updateLevelRecord } from "../storage/levelStats";
import { appendTrials, buildPersistedTrials } from "../storage/trialHistory";
import { pushResults } from "../sync/pushResults";
import { Addition } from "engine";
import type { Level } from "../level";
import type { Finished, TrialResult } from "./index";
import type { AuthState } from "../auth/store";

// A fixed fixture, not the real catalog's level 1 — tests shouldn't depend
// on production Level content (which now lives in the backend).
const LEVEL_FIXTURE: Level = { "1d+1d": 50, "1dx1d": 50 };

function makeResult(timeTaken: number): TrialResult {
  const op = Addition.create({ type: "addition", codename: "1d+1d", lDigits: 1, rDigits: 1 });
  return {
    operation: op,
    answer: op.result(),
    correct: true,
    timeExceeded: false,
    timeTaken,
    hintShown: false,
    keystrokes: [],
    hasErased: false,
    streakAtSubmit: 1,
    hintsAvailableAtStart: 3,
  };
}

function makeFinished(): Finished {
  return {
    type: "finished",
    config: { levelNumber: 4, level: LEVEL_FIXTURE, totalTrials: 20 },
    runId: "run-abc",
    results: [makeResult(1000), makeResult(1500)],
    correctCount: 2,
    levelCompleted: true,
    stars: 2,
  };
}

const loggedOut: AuthState = { type: "loggedOut" };
const anonymous: AuthState = { type: "anonymous", token: "anon-tok" };
const loggedIn: AuthState = { type: "loggedIn", token: "tok123", email: "a@b.com" };

describe("persistFinishedLevel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(buildPersistedTrials).mockReturnValue([{ fake: "persisted-trial" }] as never);
  });

  it("always updates the local level record and trial history", () => {
    const state = makeFinished();
    persistFinishedLevel(state, loggedOut);

    expect(updateLevelRecord).toHaveBeenCalledWith(4, "run-abc", {
      stars: 2,
      totalTime: 2500,
      levelCompleted: true,
    });
    expect(buildPersistedTrials).toHaveBeenCalledWith(state.config, state.results, state.runId);
    expect(appendTrials).toHaveBeenCalledWith([{ fake: "persisted-trial" }]);
  });

  it("returns whether the run was a new record, straight from updateLevelRecord", () => {
    vi.mocked(updateLevelRecord).mockReturnValue(true);
    expect(persistFinishedLevel(makeFinished(), loggedOut)).toBe(true);

    vi.mocked(updateLevelRecord).mockReturnValue(false);
    expect(persistFinishedLevel(makeFinished(), loggedOut)).toBe(false);
  });

  it("does not sync to the backend when logged out", () => {
    persistFinishedLevel(makeFinished(), loggedOut);

    expect(pushResults).not.toHaveBeenCalled();
  });

  it("syncs results when logged in", () => {
    const state = makeFinished();
    persistFinishedLevel(state, loggedIn);

    expect(pushResults).toHaveBeenCalledWith(
      "tok123",
      state.results,
      [{ fake: "persisted-trial" }],
    );
  });

  it("also syncs results when anonymous — every session gets pushed, not just logged-in ones", () => {
    const state = makeFinished();
    persistFinishedLevel(state, anonymous);

    expect(pushResults).toHaveBeenCalledWith(
      "anon-tok",
      state.results,
      [{ fake: "persisted-trial" }],
    );
  });
});
