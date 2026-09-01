import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrialResult } from "engine";
import { Addition } from "engine";
import { createPracticeStore, policy } from "./index";

// ─── Practice's own policy: pickNext (no dedup), isComplete (always
// false), buildTerminalState (unscored), initialHintsRemaining ─────────

function evaluatedResult(overrides: Partial<TrialResult> = {}): TrialResult {
  const op = new Addition(1, 1, {
    type: "addition",
    codename: "1d+1d",
    lDigits: 1,
    rDigits: 1,
  });
  return {
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
      policy.initialHintsRemaining({ categoryCodename: "1d+1d" }),
    ).toBeUndefined();
  });
});

describe("policy.isComplete", () => {
  it("is always false — Practice never auto-completes via advance", () => {
    const config = { categoryCodename: "1d+1d" };
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
      { categoryCodename: "1dx1d" },
      "run-abc",
    );
    expect(stopped).toEqual({
      type: "stopped",
      config: { categoryCodename: "1dx1d" },
      runId: "run-abc",
      results,
    });
  });
});

describe("policy.pickNext", () => {
  it("draws from the configured category, with no dedup tracking (repeats allowed)", () => {
    const { operation, pickState } = policy.pickNext(
      { categoryCodename: "1d+1d" },
      undefined,
    );
    expect(operation.categoryCodename()).toBe("1d+1d");
    expect(pickState).toBeUndefined();
  });
});

// ─── Wiring smoke test — the shared machine itself is covered by
// trialSession/index.test.ts; this proves createPracticeStore() plugs
// Practice's policy in correctly, and that stop() reaches forceComplete ──

describe("createPracticeStore", () => {
  beforeEach(() => {
    vi.spyOn(Date, "now").mockReturnValue(1_000_000);
  });

  it("starts, plays a trial, and stop() ends the session with results so far — unscored", () => {
    const store = createPracticeStore();
    store.getState().start({ categoryCodename: "1d+1d" });

    const playing = store.getState().state;
    if (playing.type !== "playing") throw new Error();
    store.getState().submitAnswer(playing.currentOperation.result());
    store.getState().advance();

    store.getState().stop();
    const stopped = store.getState().state;
    if (stopped.type !== "stopped") throw new Error();
    expect(stopped.results).toHaveLength(1);
    expect(stopped.runId).toBe(playing.runId);
  });

  it("start() from stopped generates a fresh runId", () => {
    const store = createPracticeStore();
    store.getState().start({ categoryCodename: "1dx1d" });
    const first = store.getState().state;
    if (first.type !== "playing") throw new Error();
    store.getState().stop();

    store.getState().start({ categoryCodename: "1dx1d" });
    const second = store.getState().state;
    if (second.type !== "playing") throw new Error();
    expect(second.runId).not.toBe(first.runId);
  });

  it("reset() returns to idle", () => {
    const store = createPracticeStore();
    store.getState().start({ categoryCodename: "1d+1d" });
    store.getState().stop();
    store.getState().reset();
    expect(store.getState().state.type).toBe("idle");
  });
});
