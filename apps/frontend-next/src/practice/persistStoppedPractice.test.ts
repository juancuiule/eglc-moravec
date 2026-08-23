import { describe, it, expect, vi } from "vitest";

vi.mock("../storage/practiceHistory", () => ({
  appendPracticeTrials: vi.fn(),
  buildPersistedPracticeTrials: vi.fn(() => [{ fake: "persisted-practice-trial" }]),
}));

import { persistStoppedPractice } from "./persistStoppedPractice";
import { appendPracticeTrials, buildPersistedPracticeTrials } from "../storage/practiceHistory";
import { Addition } from "engine";
import type { PracticeStopped, PracticeTrialResult } from "./index";

function makeResult(): PracticeTrialResult {
  const op = Addition.create({ type: "addition", codename: "1d+1d", lDigits: 1, rDigits: 1 });
  return {
    operation: op,
    answer: op.result(),
    correct: true,
    timeExceeded: false,
    timeTaken: 800,
    hintShown: false,
    keystrokes: [],
    hasErased: false,
  };
}

describe("persistStoppedPractice", () => {
  it("builds and appends the stopped session's trials to Practice history", () => {
    const state: PracticeStopped = {
      type: "stopped",
      config: { categoryCodename: "1d+1d" },
      results: [makeResult(), makeResult()],
    };

    persistStoppedPractice(state);

    expect(buildPersistedPracticeTrials).toHaveBeenCalledWith(state.results);
    expect(appendPracticeTrials).toHaveBeenCalledWith([{ fake: "persisted-practice-trial" }]);
  });
});
