import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../api/Api", () => ({ Api: { syncResults: vi.fn() } }));

import { pushResults } from "./pushResults";
import { Api } from "../api/Api";
import { Addition } from "engine";
import type { GameConfig, TrialResult } from "../game/index";
import { computePlayedAtTimestamps } from "../storage/playedAt";

const NOW = new Date("2026-01-01T00:00:00.000Z").getTime();

function makeResult(): TrialResult {
  const op = Addition.create({ type: "addition", codename: "1d+1d", lDigits: 1, rDigits: 1 });
  return {
    operation: op,
    answer: op.result(),
    correct: true,
    timeExceeded: false,
    timeTaken: 1200,
    hintShown: false,
  };
}

const config: GameConfig = {
  levelNumber: 3,
  level: { "1d+1d": 100 },
  totalTrials: 20,
};

describe("pushResults", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    vi.spyOn(crypto, "randomUUID").mockReturnValue("11111111-1111-4111-8111-111111111111");
  });

  it("builds the wire payload and calls Api.syncResults", () => {
    const result = makeResult();
    vi.mocked(Api.syncResults).mockResolvedValue(undefined);

    pushResults("tok", config, [result], "run-abc");

    const [playedAt] = computePlayedAtTimestamps([result.timeTaken], NOW);
    expect(Api.syncResults).toHaveBeenCalledWith("tok", [
      {
        id: "11111111-1111-4111-8111-111111111111",
        runType: "level",
        levelNumber: 3,
        categoryCodename: "1d+1d",
        operands: result.operation.operands(),
        answer: result.answer,
        timeTaken: 1200,
        playedAt,
        hintShown: false,
        runId: "run-abc",
      },
    ]);
  });

  it("is fire-and-forget — a rejected call never throws", () => {
    vi.mocked(Api.syncResults).mockRejectedValue(new Error("network down"));

    expect(() => pushResults("tok", config, [makeResult()], "run-abc")).not.toThrow();
  });
});
