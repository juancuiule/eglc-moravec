import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../api/Api", () => ({ Api: { syncResults: vi.fn() } }));

import { pushPracticeResults } from "./pushPracticeResults";
import { Api } from "../api/Api";
import { Addition, type TrialResult } from "engine";

function makeResult(): TrialResult {
  const op = Addition.create({
    type: "addition",
    codename: "1d+1d",
    lDigits: 1,
    rDigits: 1,
  });
  return {
    operation: op,
    answer: op.result(),
    correct: true,
    timeExceeded: false,
    timeTaken: 800,
    hintShown: false,
  };
}

describe("pushPracticeResults", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes a practice policy (null levelNumber) through to Api.syncResults", () => {
    vi.mocked(Api.syncResults).mockResolvedValue({ trials: [] });

    pushPracticeResults("tok", [makeResult()], "practice-run-abc");

    expect(Api.syncResults).toHaveBeenCalledTimes(1);
    const [token, payload] = vi.mocked(Api.syncResults).mock.calls[0];
    expect(token).toBe("tok");
    expect(payload).toHaveLength(1);
    expect(payload[0]).toMatchObject({
      runType: "practice",
      levelNumber: null,
      runId: "practice-run-abc",
    });
  });

  it("is fire-and-forget — a rejected call never throws", () => {
    vi.mocked(Api.syncResults).mockRejectedValue(new Error("network down"));

    expect(() =>
      pushPracticeResults("tok", [makeResult()], "practice-run-abc"),
    ).not.toThrow();
  });
});
