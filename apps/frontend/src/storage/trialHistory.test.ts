import { describe, it, expect, beforeEach } from "vitest";
import { Addition } from "engine";
import { store } from "./store";
import { buildPersistedTrials, loadTrialHistory, appendTrials, type PersistedTrial } from "./trialHistory";
import type { GameConfig, TrialResult } from "../game/index";

beforeEach(() => {
  store.delTables();
});

const config: GameConfig = { levelNumber: 3, level: { "1d+1d": 1 }, totalTrials: 1 };

function fakeResult(overrides: Partial<TrialResult> = {}): TrialResult {
  const op = Addition.create({ type: "addition", codename: "1d+1d", lDigits: 1, rDigits: 1 });
  return {
    operation: op,
    answer: op.result(),
    correct: true,
    timeExceeded: false,
    timeTaken: 1000,
    keystrokes: [{ key: "9", t: 100 }],
    hintShown: false,
    hasErased: false,
    streakAtSubmit: 1,
    hintsAvailableAtStart: 3,
    ...overrides,
  };
}

describe("buildPersistedTrials", () => {
  it("stamps each trial with a fresh, distinct trialId", () => {
    const trials = buildPersistedTrials(config, [fakeResult(), fakeResult()], "run-1");
    expect(trials[0].trialId).toBeTruthy();
    expect(trials[1].trialId).toBeTruthy();
    expect(trials[0].trialId).not.toBe(trials[1].trialId);
  });
});

describe("appendTrials / loadTrialHistory", () => {
  it("round-trips a trial through the store", () => {
    const [trial] = buildPersistedTrials(config, [fakeResult()], "run-1");
    appendTrials([trial]);

    const history = loadTrialHistory();
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      levelNumber: 3,
      categoryCodename: "1d+1d",
      correct: true,
      runId: "run-1",
      trialId: trial.trialId,
    });
    expect(history[0].keystrokes).toEqual([{ key: "9", t: 100 }]);
  });

  it("does nothing for an empty batch", () => {
    appendTrials([]);
    expect(loadTrialHistory()).toHaveLength(0);
  });

  it("caps stored trials at 2000, evicting the oldest first", () => {
    const trials: PersistedTrial[] = Array.from({ length: 2005 }, (_, i) =>
      buildPersistedTrials(config, [fakeResult()], `run-${i}`)[0],
    );
    trials.forEach((t, i) => appendTrials([{ ...t, playedAt: new Date(1_700_000_000_000 + i).toISOString() }]));

    const history = loadTrialHistory();
    expect(history).toHaveLength(2000);
    expect(history[0].runId).toBe("run-5"); // the 5 oldest were evicted
  });
});
