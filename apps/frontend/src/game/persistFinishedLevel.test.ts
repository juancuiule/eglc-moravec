import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../storage/levelStats", () => ({
  updateLevelRecord: vi.fn(),
}));

vi.mock("../storage/trialHistory", () => ({
  appendTrials: vi.fn(),
  buildPersistedTrials: vi.fn(() => [{ fake: "persisted-trial" }]),
}));

vi.mock("../sync/trialResults/queue", () => ({
  queueTrialResults: vi.fn(),
}));

import { persistFinishedLevel } from "./persistFinishedLevel";
import { updateLevelRecord } from "../storage/levelStats";
import { appendTrials, buildPersistedTrials } from "../storage/trialHistory";
import { queueTrialResults } from "../sync/trialResults/queue";
import { Addition } from "engine";
import type { Level } from "../level";
import type { Finished, TrialResult } from "./index";

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
    correctInTime: 2,
    levelCompleted: true,
    stars: 2,
  };
}

describe("persistFinishedLevel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(buildPersistedTrials).mockReturnValue([{ fake: "persisted-trial" }] as never);
  });

  it("always updates the local level record and trial history", () => {
    const state = makeFinished();
    persistFinishedLevel(state);

    expect(updateLevelRecord).toHaveBeenCalledWith(4, { stars: 2, totalTime: 2500 });
    expect(buildPersistedTrials).toHaveBeenCalledWith(state.config, state.results, state.runId);
    expect(appendTrials).toHaveBeenCalledWith([{ fake: "persisted-trial" }]);
  });

  it("queues the Trial results for sync — unconditionally, no auth state needed", () => {
    const state = makeFinished();
    persistFinishedLevel(state);

    expect(queueTrialResults).toHaveBeenCalledWith(state.results, [{ fake: "persisted-trial" }]);
  });
});
