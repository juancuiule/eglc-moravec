import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../sync/pushResults", () => ({
  pushResults: vi.fn(),
}));

import { persistFinishedLevel } from "./persistFinishedLevel";
import { pushResults } from "../sync/pushResults";
import { Addition, type TrialResult } from "engine";
import type { Level } from "../level";
import type { Finished } from "./index";
import type { AuthState } from "../auth/store";
import type { LevelStats } from "../api/Api";

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

const loggedOut: AuthState = { type: "logged-out" };
const anonymous: AuthState = { type: "anonymous", token: "anon-tok" };
const loggedIn: AuthState = { type: "logged-in", token: "tok123", email: "a@b.com" };

describe("persistFinishedLevel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns true when there's no previous record for the level", () => {
    expect(persistFinishedLevel(makeFinished(), loggedOut, undefined)).toBe(true);
  });

  it("returns true when this run beats the previous record (more stars)", () => {
    const previousRecord: LevelStats = { stars: 1, totalTime: 5000, completedAt: "x" };
    expect(persistFinishedLevel(makeFinished(), loggedOut, previousRecord)).toBe(true); // this run: 2 stars
  });

  it("returns false when this run does not beat the previous record", () => {
    const previousRecord: LevelStats = { stars: 3, totalTime: 5000, completedAt: "x" };
    expect(persistFinishedLevel(makeFinished(), loggedOut, previousRecord)).toBe(false); // this run: 2 stars
  });

  it("does not sync to the backend when logged out", () => {
    persistFinishedLevel(makeFinished(), loggedOut, undefined);

    expect(pushResults).not.toHaveBeenCalled();
  });

  it("syncs results when logged in", () => {
    const state = makeFinished();
    persistFinishedLevel(state, loggedIn, undefined);

    expect(pushResults).toHaveBeenCalledWith("tok123", state.config, state.results, state.runId);
  });

  it("also syncs results when anonymous — every session gets pushed, not just logged-in ones", () => {
    const state = makeFinished();
    persistFinishedLevel(state, anonymous, undefined);

    expect(pushResults).toHaveBeenCalledWith("anon-tok", state.config, state.results, state.runId);
  });
});
