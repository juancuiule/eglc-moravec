import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../storage/levelStats", () => ({
  updateLevelRecord: vi.fn(),
}));

vi.mock("../storage/trialHistory", () => ({
  appendTrials: vi.fn(),
  buildPersistedTrials: vi.fn(() => [{ fake: "persisted-trial" }]),
}));

vi.mock("../sync/push", () => ({
  pushResults: vi.fn(),
  pushLevelStats: vi.fn(),
}));

import { persistFinishedLevel } from "./persistFinishedLevel";
import { updateLevelRecord } from "../storage/levelStats";
import { appendTrials, buildPersistedTrials } from "../storage/trialHistory";
import { pushResults, pushLevelStats } from "../sync/push";
import { LEVELS } from "../LEVELS";
import { Addition } from "engine";
import type { Finished, TrialResult } from "./index";
import type { AuthState } from "../auth/index";

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
  };
}

function makeFinished(): Finished {
  return {
    type: "finished",
    config: { levelNumber: 4, level: LEVELS["1"], totalTrials: 20 },
    results: [makeResult(1000), makeResult(1500)],
    correctInTime: 2,
    levelCompleted: true,
    stars: 2,
  };
}

const loggedOut: AuthState = { type: "idle" };
const loggedIn: AuthState = { type: "loggedIn", token: "tok123", email: "a@b.com" };

describe("persistFinishedLevel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(buildPersistedTrials).mockReturnValue([{ fake: "persisted-trial" }] as never);
  });

  it("always updates the local level record and trial history", () => {
    const state = makeFinished();
    persistFinishedLevel(state, loggedOut);

    expect(updateLevelRecord).toHaveBeenCalledWith(4, { stars: 2, totalTime: 2500 });
    expect(buildPersistedTrials).toHaveBeenCalledWith(state.config, state.results);
    expect(appendTrials).toHaveBeenCalledWith([{ fake: "persisted-trial" }]);
  });

  it("does not sync to the backend when logged out", () => {
    persistFinishedLevel(makeFinished(), loggedOut);

    expect(pushResults).not.toHaveBeenCalled();
    expect(pushLevelStats).not.toHaveBeenCalled();
  });

  it("syncs results and level stats when logged in", () => {
    persistFinishedLevel(makeFinished(), loggedIn);

    expect(pushResults).toHaveBeenCalledWith("tok123", [{ fake: "persisted-trial" }]);
    expect(pushLevelStats).toHaveBeenCalledWith("tok123", 4, { stars: 2, totalTime: 2500 });
  });
});
