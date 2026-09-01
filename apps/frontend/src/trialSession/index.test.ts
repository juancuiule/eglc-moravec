import { beforeEach, describe, expect, it, vi } from "vitest";
import { Addition, Multiplication, type TrialResult } from "engine";
import { createTrialSessionStore, type TrialSessionPolicy } from "./index";

// ─── A minimal fake policy — exercises the shared machine without either
// Level's or Practice's real rules ──────────────────────────────────────

type FakeConfig = { totalTrials: number };
type FakeTerminal = {
  type: "done";
  config: FakeConfig;
  runId: string;
  results: TrialResult[];
};
type FakePickState = number; // number of picks made so far

function additionOperation() {
  return Addition.create({
    type: "addition",
    codename: "1d+1d",
    lDigits: 1,
    rDigits: 1,
  });
}

// 2dx1d, not 1dx1d — Multiplication.hint() returns NoHint when both
// operands are single-digit, so hint tests need a category guaranteed to
// actually have one.
function multiplicationOperation() {
  return Multiplication.create({
    type: "multiplication",
    codename: "2dx1d",
    lDigits: 2,
    rDigits: 1,
  });
}

function makePolicy(
  overrides: Partial<
    TrialSessionPolicy<FakeConfig, FakeTerminal, FakePickState>
  > = {},
): TrialSessionPolicy<FakeConfig, FakeTerminal, FakePickState> {
  return {
    initialHintsRemaining: () => 2,
    initialPickState: () => 0,
    pickNext: (_config, pickState) => ({
      operation: additionOperation(),
      pickState: pickState + 1,
    }),
    isComplete: (results, config) => results.length >= config.totalTrials,
    buildTerminalState: (results, config, runId) => ({
      type: "done",
      config,
      runId,
      results,
    }),
    ...overrides,
  };
}

describe("createTrialSessionStore", () => {
  let store: ReturnType<
    typeof createTrialSessionStore<FakeConfig, FakeTerminal, FakePickState>
  >;

  beforeEach(() => {
    store = createTrialSessionStore(makePolicy());
    vi.spyOn(Date, "now").mockReturnValue(1_000_000);
  });

  it("starts in idle state", () => {
    expect(store.getState().state.type).toBe("idle");
  });

  it("start() transitions to playing, seeded via the policy", () => {
    store.getState().start({ totalTrials: 3 });
    const s = store.getState().state;
    expect(s.type).toBe("playing");
    if (s.type !== "playing") return;
    expect(s.pickState).toBe(1); // pickNext called once, from initialPickState() = 0
    expect(s.hintsRemaining).toBe(2);
    expect(s.results).toEqual([]);
  });

  it("start() is guarded — ignored while already playing", () => {
    store.getState().start({ totalTrials: 3 });
    const before = store.getState().state;
    store.getState().start({ totalTrials: 5 });
    expect(store.getState().state).toBe(before);
  });

  it("start() is allowed from a terminal state", () => {
    store.getState().start({ totalTrials: 0 }); // isComplete is true immediately on first advance
    const playing = store.getState().state;
    if (playing.type !== "playing") throw new Error();
    store.getState().submitAnswer(playing.currentOperation.result());
    store.getState().advance();
    expect(store.getState().state.type).toBe("done");

    store.getState().start({ totalTrials: 3 });
    expect(store.getState().state.type).toBe("playing");
  });

  it("start() generates a fresh runId each time", () => {
    store.getState().start({ totalTrials: 0 });
    const first = store.getState().state;
    if (first.type !== "playing") throw new Error();

    store.getState().submitAnswer(first.currentOperation.result());
    store.getState().advance();

    store.getState().start({ totalTrials: 0 });
    const second = store.getState().state;
    if (second.type !== "playing") throw new Error();

    expect(second.runId).not.toBe(first.runId);
  });

  describe("while playing", () => {
    beforeEach(() => {
      store.getState().start({ totalTrials: 3 });
    });

    it("submitAnswer moves to reviewing", () => {
      const s = store.getState().state;
      if (s.type !== "playing") throw new Error();
      store.getState().submitAnswer(s.currentOperation.result());
      const next = store.getState().state;
      if (next.type !== "playing") throw new Error();
      expect(next.playingState.type).toBe("reviewing");
    });

    it("timeUp moves to reviewing with correct=false and timeExceeded=true when nothing was typed", () => {
      store.getState().timeUp(null);
      const s = store.getState().state;
      if (s.type !== "playing" || s.playingState.type !== "reviewing")
        throw new Error();
      expect(s.playingState.result.correct).toBe(false);
      expect(s.playingState.result.timeExceeded).toBe(true);
      expect(s.playingState.result.answer).toBeNull();
    });

    it("advance (not yet complete) records the result, picks the next operation via policy, and resets to answering", () => {
      const s = store.getState().state;
      if (s.type !== "playing") throw new Error();
      store.getState().submitAnswer(s.currentOperation.result());
      store.getState().advance();
      const next = store.getState().state;
      if (next.type !== "playing") throw new Error();
      expect(next.results).toHaveLength(1);
      expect(next.pickState).toBe(2); // one more pick than the initial one
      expect(next.trialId).toBe(1);
      expect(next.playingState.type).toBe("answering");
      expect(next.hintVisible).toBe(false);
    });

    it("advance (isComplete) transitions to the policy's terminal state", () => {
      const complete = createTrialSessionStore(
        makePolicy({ isComplete: () => true }),
      );
      complete.getState().start({ totalTrials: 1 });
      const s = complete.getState().state;
      if (s.type !== "playing") throw new Error();
      complete.getState().submitAnswer(s.currentOperation.result());
      complete.getState().advance();
      const done = complete.getState().state;
      expect(done.type).toBe("done");
      if (done.type !== "done") return;
      expect(done.results).toHaveLength(1);
    });

    it("hintVisible resets to false after advance", () => {
      const multStore = createTrialSessionStore(
        makePolicy({
          pickNext: (_c, ps) => ({
            operation: multiplicationOperation(),
            pickState: ps + 1,
          }),
        }),
      );
      multStore.getState().start({ totalTrials: 3 });
      multStore.getState().requestHint();
      const s = multStore.getState().state;
      if (s.type !== "playing") throw new Error();
      multStore.getState().submitAnswer(s.currentOperation.result());
      multStore.getState().advance();
      const after = multStore.getState().state;
      if (after.type !== "playing") throw new Error();
      expect(after.hintVisible).toBe(false);
    });
  });

  describe("requestHint", () => {
    function multStoreWithBudget(hintsRemaining: number | undefined) {
      const s = createTrialSessionStore(
        makePolicy({
          initialHintsRemaining: () => hintsRemaining,
          pickNext: (_c, ps) => ({
            operation: multiplicationOperation(),
            pickState: ps + 1,
          }),
        }),
      );
      s.getState().start({ totalTrials: 3 });
      return s;
    }

    it("sets hintVisible and decrements a defined budget", () => {
      const s = multStoreWithBudget(2);
      s.getState().requestHint();
      const after = s.getState().state;
      if (after.type !== "playing") throw new Error();
      expect(after.hintVisible).toBe(true);
      expect(after.hintsRemaining).toBe(1);
    });

    it("is idempotent — second call doesn't decrement again", () => {
      const s = multStoreWithBudget(2);
      s.getState().requestHint();
      s.getState().requestHint();
      const after = s.getState().state;
      if (after.type !== "playing") throw new Error();
      expect(after.hintsRemaining).toBe(1);
    });

    it("is blocked once the budget hits 0", () => {
      const s = multStoreWithBudget(0);
      s.getState().requestHint();
      const after = s.getState().state;
      if (after.type !== "playing") throw new Error();
      expect(after.hintVisible).toBe(false);
    });

    it("an undefined budget is unlimited — hintsRemaining stays undefined", () => {
      const s = multStoreWithBudget(undefined);
      s.getState().requestHint();
      const after = s.getState().state;
      if (after.type !== "playing") throw new Error();
      expect(after.hintVisible).toBe(true);
      expect(after.hintsRemaining).toBeUndefined();
    });

    it("is blocked while reviewing", () => {
      const s = multStoreWithBudget(2);
      const playing = s.getState().state;
      if (playing.type !== "playing") throw new Error();
      s.getState().submitAnswer(playing.currentOperation.result());
      s.getState().requestHint();
      const after = s.getState().state;
      if (after.type !== "playing") throw new Error();
      expect(after.hintVisible).toBe(false);
    });
  });

  describe("forceComplete", () => {
    it("jumps straight from playing to the terminal state, bypassing isComplete", () => {
      store.getState().start({ totalTrials: 100 }); // nowhere near complete
      store.getState().forceComplete();
      expect(store.getState().state.type).toBe("done");
    });

    it("carries through whatever results were recorded so far", () => {
      store.getState().start({ totalTrials: 100 });
      const s = store.getState().state;
      if (s.type !== "playing") throw new Error();
      store.getState().submitAnswer(s.currentOperation.result());
      store.getState().advance();
      store.getState().forceComplete();
      const done = store.getState().state;
      if (done.type !== "done") throw new Error();
      expect(done.results).toHaveLength(1);
    });

    it("is a no-op outside playing", () => {
      store.getState().forceComplete();
      expect(store.getState().state.type).toBe("idle");
    });
  });

  it("reset() returns to idle from any state", () => {
    store.getState().start({ totalTrials: 3 });
    store.getState().reset();
    expect(store.getState().state.type).toBe("idle");
  });
});
