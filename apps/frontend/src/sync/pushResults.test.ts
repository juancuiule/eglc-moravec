import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../api/Api", () => ({ Api: { syncResults: vi.fn() } }));

import { Addition, TrialResult } from "engine";
import { Api } from "../api/Api";
import { pushResults } from "./pushResults";

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
    timeTaken: 1200,
    hintShown: false,
  };
}

describe("pushResults", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes a level policy through to Api.syncResults", () => {
    vi.mocked(Api.syncResults).mockResolvedValue({ trials: [] });

    pushResults("tok", 3, [makeResult()], "run-abc");

    expect(Api.syncResults).toHaveBeenCalledTimes(1);
    const [token, payload] = vi.mocked(Api.syncResults).mock.calls[0];
    expect(token).toBe("tok");
    expect(payload).toHaveLength(1);
    expect(payload[0]).toMatchObject({
      runType: "level",
      levelNumber: 3,
      runId: "run-abc",
    });
  });

  it("is fire-and-forget — a rejected call never throws", () => {
    vi.mocked(Api.syncResults).mockRejectedValue(new Error("network down"));

    expect(() =>
      pushResults("tok", 3, [makeResult()], "run-abc"),
    ).not.toThrow();
  });

  it("returns a promise that resolves even when the underlying push fails", async () => {
    vi.mocked(Api.syncResults).mockRejectedValue(new Error("network down"));

    await expect(
      pushResults("tok", 3, [makeResult()], "run-abc"),
    ).resolves.toBeUndefined();
  });

  it("returns a promise that resolves once the push succeeds — a caller can chain off it", async () => {
    vi.mocked(Api.syncResults).mockResolvedValue({ trials: [] });

    await expect(
      pushResults("tok", 3, [makeResult()], "run-abc"),
    ).resolves.toBeUndefined();
  });
});
