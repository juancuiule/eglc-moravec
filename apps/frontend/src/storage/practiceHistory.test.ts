import { describe, it, expect, beforeEach } from "vitest";
import { Multiplication } from "engine";
import { store } from "./store";
import { buildPersistedPracticeTrials, loadPracticeHistory, appendPracticeTrials } from "./practiceHistory";
import type { BaseTrialResult } from "engine";

beforeEach(() => {
  store.delTables();
});

function fakeResult(overrides: Partial<BaseTrialResult> = {}): BaseTrialResult {
  const op = Multiplication.create({ type: "multiplication", codename: "1dx1d", lDigits: 1, rDigits: 1 });
  return {
    operation: op,
    answer: op.result(),
    correct: true,
    timeExceeded: false,
    timeTaken: 800,
    keystrokes: [{ key: "6", t: 50 }],
    hintShown: false,
    hasErased: false,
    ...overrides,
  };
}

describe("buildPersistedPracticeTrials", () => {
  it("stamps each trial with a fresh, distinct trialId", () => {
    const trials = buildPersistedPracticeTrials([fakeResult(), fakeResult()], "session-1");
    expect(trials[0].trialId).toBeTruthy();
    expect(trials[1].trialId).not.toBe(trials[0].trialId);
  });
});

describe("appendPracticeTrials / loadPracticeHistory", () => {
  it("round-trips a Practice trial through the store", () => {
    const [trial] = buildPersistedPracticeTrials([fakeResult()], "session-1");
    appendPracticeTrials([trial]);

    const history = loadPracticeHistory();
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      categoryCodename: "1dx1d",
      correct: true,
      runId: "session-1",
      trialId: trial.trialId,
    });
  });

  it("keeps Level and Practice histories independent", async () => {
    const { buildPersistedTrials, appendTrials } = await import("./trialHistory");
    const config = { levelNumber: 1, level: { "1d+1d": 1 }, totalTrials: 1 } as Parameters<typeof buildPersistedTrials>[0];
    const [levelTrial] = buildPersistedTrials(
      config,
      [{ operation: { categoryCodename: () => "1d+1d" }, correct: true, timeExceeded: false, timeTaken: 500, keystrokes: [], hintShown: false, streakAtSubmit: 0, hintsAvailableAtStart: 3, answer: 1 } as never],
      "run-x",
    );
    appendTrials([levelTrial]);

    const [practiceTrial] = buildPersistedPracticeTrials([fakeResult()], "session-1");
    appendPracticeTrials([practiceTrial]);

    expect(loadPracticeHistory()).toHaveLength(1);
    expect(loadPracticeHistory()[0].trialId).toBe(practiceTrial.trialId);
  });
});
