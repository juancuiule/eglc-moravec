import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../api/Api", () => ({ Api: { syncResults: vi.fn() } }));

import { pushPracticeResults } from "./pushPracticeResults";
import { Api, type SyncTrial } from "../api/Api";
import { Addition } from "engine";
import type { PracticeTrialResult } from "../practice/index";
import type { PersistedPracticeTrial } from "../storage/practiceHistory";

function makeResult(overrides: Partial<PracticeTrialResult> = {}): PracticeTrialResult {
  const op = Addition.create({ type: "addition", codename: "1d+1d", lDigits: 1, rDigits: 1 });
  return {
    operation: op,
    answer: op.result(),
    correct: true,
    timeExceeded: false,
    timeTaken: 800,
    hintShown: false,
    keystrokes: [{ key: "1", t: 50 }],
    hasErased: false,
    ...overrides,
  };
}

function makeTrial(overrides: Partial<PersistedPracticeTrial> = {}): PersistedPracticeTrial {
  return {
    categoryCodename: "1d+1d",
    correct: true,
    timeExceeded: false,
    timeTaken: 800,
    playedAt: "2026-01-01T00:00:00.000Z",
    keystrokes: [{ key: "1", t: 50 }],
    hintShown: false,
    runId: "practice-run-abc",
    ...overrides,
  };
}

describe("pushPracticeResults", () => {
  beforeEach(() => vi.clearAllMocks());

  it("builds the wire payload with runType practice and a null levelNumber", () => {
    const result = makeResult();
    const trial = makeTrial();
    vi.mocked(Api.syncResults).mockResolvedValue(undefined);

    pushPracticeResults("tok", [result], [trial]);

    expect(Api.syncResults).toHaveBeenCalledWith("tok", [
      {
        runType: "practice",
        levelNumber: null,
        categoryCodename: "1d+1d",
        correct: true,
        timeExceeded: false,
        timeTaken: 800,
        playedAt: new Date("2026-01-01T00:00:00.000Z").getTime(),
        keystrokes: [{ key: "1", t: 50 }],
        operands: result.operation.operands(),
        answer: result.answer,
        hintShown: false,
        streakAtSubmit: 0,
        hintsAvailableAtStart: 0,
        runId: "practice-run-abc",
      },
    ]);
  });

  it("computes streakAtSubmit retroactively from the results before each trial", () => {
    const results = [
      makeResult({ correct: true }),
      makeResult({ correct: true }),
      makeResult({ correct: false }),
      makeResult({ correct: true }),
    ];
    const trials = results.map((_, i) => makeTrial({ timeTaken: 800 + i }));
    vi.mocked(Api.syncResults).mockResolvedValue(undefined);

    pushPracticeResults("tok", results, trials);

    const payload = vi.mocked(Api.syncResults).mock.calls[0][1] as SyncTrial[];
    expect(payload.map((p) => p.streakAtSubmit)).toEqual([0, 1, 2, 0]);
  });

  it("is fire-and-forget — a rejected call never throws", () => {
    vi.mocked(Api.syncResults).mockRejectedValue(new Error("network down"));

    expect(() => pushPracticeResults("tok", [makeResult()], [makeTrial()])).not.toThrow();
  });
});
