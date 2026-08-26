import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../api/Api", () => ({ Api: { syncResults: vi.fn() } }));

import { pushResults } from "./pushResults";
import { Api } from "../api/Api";
import { Addition } from "engine";
import type { TrialResult } from "../game/index";
import type { PersistedTrial } from "../storage/trialHistory";

function makeResult(): TrialResult {
  const op = Addition.create({ type: "addition", codename: "1d+1d", lDigits: 1, rDigits: 1 });
  return {
    operation: op,
    answer: op.result(),
    correct: true,
    timeExceeded: false,
    timeTaken: 1200,
    hintShown: false,
    keystrokes: [{ key: "1", t: 100 }],
    hasErased: false,
    streakAtSubmit: 0,
    hintsAvailableAtStart: 3,
  };
}

function makeTrial(overrides: Partial<PersistedTrial> = {}): PersistedTrial {
  return {
    levelNumber: 3,
    categoryCodename: "1d+1d",
    correct: true,
    timeExceeded: false,
    timeTaken: 1200,
    playedAt: "2026-01-01T00:00:00.000Z",
    keystrokes: [{ key: "1", t: 100 }],
    hintShown: false,
    streakAtSubmit: 0,
    hintsAvailableAtStart: 3,
    runId: "run-abc",
    ...overrides,
  };
}

describe("pushResults", () => {
  beforeEach(() => vi.clearAllMocks());

  it("builds the wire payload and calls Api.syncResults", () => {
    const result = makeResult();
    const trial = makeTrial();
    vi.mocked(Api.syncResults).mockResolvedValue(undefined);

    pushResults("tok", [result], [trial]);

    expect(Api.syncResults).toHaveBeenCalledWith("tok", [
      {
        runType: "level",
        levelNumber: 3,
        categoryCodename: "1d+1d",
        correct: true,
        timeExceeded: false,
        timeTaken: 1200,
        playedAt: new Date("2026-01-01T00:00:00.000Z").getTime(),
        keystrokes: [{ key: "1", t: 100 }],
        operands: result.operation.operands(),
        answer: result.answer,
        hintShown: false,
        streakAtSubmit: 0,
        hintsAvailableAtStart: 3,
        runId: "run-abc",
      },
    ]);
  });

  it("is fire-and-forget — a rejected call never throws", () => {
    vi.mocked(Api.syncResults).mockRejectedValue(new Error("network down"));

    expect(() => pushResults("tok", [makeResult()], [makeTrial()])).not.toThrow();
  });
});
