import { describe, it, expect, vi, beforeEach } from "vitest";
import { pushResults } from "./push";
import type { PersistedTrial } from "../storage/trialHistory";
import { Addition } from "engine";
import type { TrialResult } from "../game/index";

function makeTrial(): PersistedTrial {
  return {
    levelNumber: 3,
    categoryCodename: "1d+1d",
    correct: true,
    timeExceeded: false,
    timeTaken: 900,
    playedAt: "2026-01-01T00:00:00.000Z",
    keystrokes: [{ key: "1", t: 10 }],
  };
}

function makeResult(): TrialResult {
  const op = Addition.create({ type: "addition", codename: "1d+1d", lDigits: 1, rDigits: 1 });
  return {
    operation: op,
    answer: op.result(),
    correct: true,
    timeExceeded: false,
    timeTaken: 900,
    hintShown: false,
    keystrokes: [{ key: "1", t: 10 }],
    hasErased: false,
    streakAtSubmit: 0,
  };
}

describe("pushResults", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
  });

  it("POSTs the already-built PersistedTrials with the session token, including keystrokes and verifiable data", async () => {
    const result = makeResult();
    pushResults("tok123", [result], [makeTrial()]);
    await Promise.resolve(); // let the fire-and-forget fetch call happen

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toContain("/sync/results");
    expect(init?.headers).toMatchObject({ Authorization: "Bearer tok123" });

    const body = JSON.parse(init?.body as string);
    expect(body.trials).toHaveLength(1);
    expect(body.trials[0]).toMatchObject({
      levelNumber: 3,
      categoryCodename: "1d+1d",
      correct: true,
      timeExceeded: false,
      timeTaken: 900,
      playedAt: new Date("2026-01-01T00:00:00.000Z").getTime(),
      keystrokes: [{ key: "1", t: 10 }],
      operands: result.operation.operands(),
      answer: result.answer,
    });
  });

  it("never throws even when the request fails", () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    expect(() => pushResults("tok123", [makeResult()], [makeTrial()])).not.toThrow();
  });
});
