import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RecordedTrialResult } from "engine";
import { Addition } from "engine";
import { createPracticeStore, policy, practiceConfigKey } from "./index";

// ─── Practice's own policy: pickNext (no dedup), isComplete (always
// false), buildTerminalState (unscored), initialHintsRemaining ─────────

function evaluatedResult(
  overrides: Partial<RecordedTrialResult> = {},
): RecordedTrialResult {
  const op = new Addition(1, 1, {
    type: "addition",
    codename: "1d+1d",
    lDigits: 1,
    rDigits: 1,
  });
  return {
    id: crypto.randomUUID(),
    playedAt: 0,
    operation: op,
    answer: 2,
    correct: true,
    timeExceeded: false,
    timeTaken: 1000,
    hintShown: false,
    ...overrides,
  };
}

describe("policy.initialHintsRemaining", () => {
  it("is undefined — Practice hints are unbudgeted", () => {
    expect(
      policy.initialHintsRemaining({
        mode: "category",
        categoryCodename: "1d+1d",
      }),
    ).toBeUndefined();
  });
});

describe("policy.isComplete", () => {
  it("is always false — Practice never auto-completes via advance", () => {
    const config = { mode: "category" as const, categoryCodename: "1d+1d" };
    const many = Array.from({ length: 500 }, () => evaluatedResult());
    expect(policy.isComplete(many, config)).toBe(false);
    expect(policy.isComplete([], config)).toBe(false);
  });
});

describe("policy.buildTerminalState", () => {
  it("carries results through with no scoring fields — Practice is unscored", () => {
    const results = [evaluatedResult(), evaluatedResult({ correct: false })];
    const stopped = policy.buildTerminalState(
      results,
      { mode: "category", categoryCodename: "1dx1d" },
      "run-abc",
    );
    expect(stopped).toEqual({
      type: "stopped",
      config: { mode: "category", categoryCodename: "1dx1d" },
      runId: "run-abc",
      results,
    });
  });
});

describe("policy.pickNext", () => {
  it("draws from the configured category, with no dedup tracking (repeats allowed)", () => {
    const { operation, pickState } = policy.pickNext(
      { mode: "category", categoryCodename: "1d+1d" },
      undefined,
    );
    expect(operation.categoryCodename()).toBe("1d+1d");
    expect(pickState).toBeUndefined();
  });

  it("focus mode draws each Trial's category from the weight map", () => {
    // Degenerate-but-valid map: only one eligible codename → deterministic.
    const { operation } = policy.pickNext(
      { mode: "focus", weights: { "2dx1d": 1 } },
      undefined,
    );
    expect(operation.categoryCodename()).toBe("2dx1d");
  });
});

describe("practiceConfigKey", () => {
  it("keys a category config on its codename", () => {
    expect(
      practiceConfigKey({ mode: "category", categoryCodename: "1d+1d" }),
    ).toBe("1d+1d");
  });

  it("keys every Focus config the same — fresh weights are the same session", () => {
    expect(practiceConfigKey({ mode: "focus", weights: { "1d+1d": 1 } })).toBe(
      "focus",
    );
  });
});

// ─── Wiring smoke test — the shared machine itself is covered by
// trialSession/index.test.ts; this proves createPracticeStore() plugs
// Practice's policy in correctly, and that stop() reaches forceComplete ──

describe("createPracticeStore", () => {
  beforeEach(() => {
    vi.spyOn(Date, "now").mockReturnValue(1_000_000);
  });

  it("stop() during reviewing ends the session with the current result exactly once", () => {
    const store = createPracticeStore();
    store.getState().start({ mode: "category", categoryCodename: "1d+1d" });

    const playing = store.getState().state;
    if (playing.type !== "playing") throw new Error();
    store.getState().submitAnswer(playing.currentOperation.result());
    const reviewing = store.getState().state;
    if (
      reviewing.type !== "playing" ||
      reviewing.playingState.type !== "reviewing"
    )
      throw new Error();
    const currentResult = reviewing.playingState.result;

    store.getState().stop();

    const stopped = store.getState().state;
    if (stopped.type !== "stopped") throw new Error();
    expect(stopped.results).toEqual([currentResult]);
    expect(stopped.runId).toBe(playing.runId);
  });

  it("start() from stopped generates a fresh runId", () => {
    const store = createPracticeStore();
    store.getState().start({ mode: "category", categoryCodename: "1dx1d" });
    const first = store.getState().state;
    if (first.type !== "playing") throw new Error();
    store.getState().stop();

    store.getState().start({ mode: "category", categoryCodename: "1dx1d" });
    const second = store.getState().state;
    if (second.type !== "playing") throw new Error();
    expect(second.runId).not.toBe(first.runId);
  });

  it("reset() returns to idle", () => {
    const store = createPracticeStore();
    store.getState().start({ mode: "category", categoryCodename: "1d+1d" });
    store.getState().stop();
    store.getState().reset();
    expect(store.getState().state.type).toBe("idle");
  });
});
