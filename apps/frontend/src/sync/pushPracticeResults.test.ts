import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../api/Api", () => ({ Api: { syncResults: vi.fn() } }));

import { pushPracticeResults } from "./pushPracticeResults";
import { Api } from "../api/Api";
import { Addition, type TrialResult } from "engine";
import { computePlayedAtTimestamps } from "../storage/playedAt";

const NOW = new Date("2026-01-01T00:00:00.000Z").getTime();

function makeResult(overrides: Partial<TrialResult> = {}): TrialResult {
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
    ...overrides,
  };
}

describe("pushPracticeResults", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    vi.spyOn(crypto, "randomUUID").mockReturnValue(
      "11111111-1111-4111-8111-111111111111",
    );
  });

  it("builds the wire payload with runType practice and a null levelNumber", () => {
    const result = makeResult();
    vi.mocked(Api.syncResults).mockResolvedValue(undefined);

    pushPracticeResults("tok", [result], "practice-run-abc");

    const [playedAt] = computePlayedAtTimestamps([result.timeTaken], NOW);
    expect(Api.syncResults).toHaveBeenCalledWith("tok", [
      {
        id: "11111111-1111-4111-8111-111111111111",
        runType: "practice",
        levelNumber: null,
        categoryCodename: "1d+1d",
        operands: result.operation.operands(),
        answer: result.answer,
        timeTaken: 800,
        playedAt,
        hintShown: false,
        runId: "practice-run-abc",
      },
    ]);
  });

  it("is fire-and-forget — a rejected call never throws", () => {
    vi.mocked(Api.syncResults).mockRejectedValue(new Error("network down"));

    expect(() =>
      pushPracticeResults("tok", [makeResult()], "practice-run-abc"),
    ).not.toThrow();
  });
});
