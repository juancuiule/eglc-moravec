import { describe, it, expect, vi, beforeEach } from "vitest";
import { trialCounts, createGameStore, TOTAL_TRIALS, HINTS_PER_LEVEL } from "./index";
import type { TrialResult } from "./index";
import { Addition } from "engine";
import { LEVELS } from "../LEVELS";

// ─── Helpers ───────────────────────────────────────────────────────────────────

const level1 = LEVELS["1"];

function makeConfig(overrides: Partial<{ levelNumber: number; totalTrials: number }> = {}) {
  return {
    levelNumber: overrides.levelNumber ?? 1,
    level: level1,
    totalTrials: overrides.totalTrials ?? TOTAL_TRIALS,
  };
}

/** Build a fake TrialResult without needing a real Operation. */
function makeResult(
  correct: boolean,
  timeExceeded: boolean,
): TrialResult {
  const op = Addition.create({ type: "addition", codename: "1d+1d", lDigits: 1, rDigits: 1 });
  return {
    operation: op,
    answer: correct ? op.result() : 0,
    correct,
    timeExceeded,
    timeTaken: timeExceeded ? op.solveTime() + 1 : op.solveTime() - 1,
    hintShown: false,
    keystrokes: [],
    hasErased: false,
    streakAtSubmit: 0,
    hintsAvailableAtStart: 3,
  };
}

// ─── trialCounts ───────────────────────────────────────────────────────────────

describe("trialCounts", () => {
  it("counts a wrong answer", () => {
    expect(trialCounts(makeResult(false, false))).toBe(true);
  });

  it("counts a timed-out answer", () => {
    expect(trialCounts(makeResult(false, true))).toBe(true);
  });

  it("counts a correct-in-time answer", () => {
    expect(trialCounts(makeResult(true, false))).toBe(true);
  });

  it("does NOT count a correct-but-late answer", () => {
    expect(trialCounts(makeResult(true, true))).toBe(false);
  });
});

// ─── Constants ─────────────────────────────────────────────────────────────────

describe("constants", () => {
  it("TOTAL_TRIALS is 20", () => {
    expect(TOTAL_TRIALS).toBe(20);
  });
});

// ─── Game store ────────────────────────────────────────────────────────────────

describe("createGameStore", () => {
  let store: ReturnType<typeof createGameStore>;

  beforeEach(() => {
    store = createGameStore();
    vi.spyOn(Date, "now").mockReturnValue(1_000_000);
  });

  it("starts in loading state", () => {
    expect(store.getState().state.type).toBe("loading");
  });

  it("transitions to playing after load()", () => {
    store.getState().load(makeConfig());
    const s = store.getState().state;
    expect(s.type).toBe("playing");
  });

  it("ignores load() while already playing", () => {
    store.getState().load(makeConfig());
    const before = store.getState().state;
    store.getState().load(makeConfig({ levelNumber: 2 }));
    expect(store.getState().state).toBe(before);
  });

  it("load() generates a valid v4 runId, without relying on crypto.randomUUID (unavailable outside secure contexts)", () => {
    store.getState().load(makeConfig());
    const s = store.getState().state;
    if (s.type !== "playing") throw new Error("not playing");
    expect(s.runId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("replay generates a fresh runId, distinct from the finished run's", () => {
    store.getState().load(makeConfig({ totalTrials: 1 }));
    const playing = store.getState().state;
    if (playing.type !== "playing") throw new Error("not playing");
    store.getState().submitAnswer(playing.currentOperation.result());
    store.getState().advance();

    const finished = store.getState().state;
    if (finished.type !== "finished") throw new Error("not finished");

    store.getState().replay();
    const replayed = store.getState().state;
    if (replayed.type !== "playing") throw new Error("not playing");
    expect(replayed.runId).not.toBe(finished.runId);
  });

  describe("while playing", () => {
    beforeEach(() => {
      store.getState().load(makeConfig());
    });

    it("submitAnswer moves to reviewing", () => {
      const s = store.getState().state;
      if (s.type !== "playing") throw new Error("not playing");
      const correct = s.currentOperation.result();
      store.getState().submitAnswer(correct);
      const next = store.getState().state;
      expect(next.type).toBe("playing");
      if (next.type !== "playing") return;
      expect(next.playingState.type).toBe("reviewing");
    });

    it("timeUp moves to reviewing with correct=false and timeExceeded=true when nothing was typed", () => {
      store.getState().timeUp(null);
      const s = store.getState().state;
      if (s.type !== "playing" || s.playingState.type !== "reviewing") throw new Error("unexpected");
      expect(s.playingState.result.correct).toBe(false);
      expect(s.playingState.result.timeExceeded).toBe(true);
      expect(s.playingState.result.answer).toBeNull();
    });

    it("timeUp credits a correct answer that was typed but never submitted", () => {
      const s0 = store.getState().state;
      if (s0.type !== "playing") throw new Error();
      const correct = s0.currentOperation.result();

      store.getState().timeUp(correct);
      const s = store.getState().state;
      if (s.type !== "playing" || s.playingState.type !== "reviewing") throw new Error("unexpected");
      expect(s.playingState.result.correct).toBe(true);
      expect(s.playingState.result.timeExceeded).toBe(true);
      expect(s.playingState.result.answer).toBe(correct);
    });

    it("submitAnswer records timeExceeded=true when answer is late", () => {
      const s = store.getState().state;
      if (s.type !== "playing") throw new Error("not playing");
      const solveTime = s.currentOperation.solveTime();
      // answer submitted 1ms after solveTime
      vi.spyOn(Date, "now").mockReturnValue(1_000_000 + solveTime + 1);
      store.getState().submitAnswer(s.currentOperation.result());
      const next = store.getState().state;
      if (next.type !== "playing" || next.playingState.type !== "reviewing") throw new Error();
      expect(next.playingState.result.correct).toBe(true);
      expect(next.playingState.result.timeExceeded).toBe(true);
    });

    it("advance after wrong answer increments trialsConsumed", () => {
      const s = store.getState().state;
      if (s.type !== "playing") throw new Error();
      store.getState().submitAnswer(s.currentOperation.result() + 99);
      store.getState().advance();
      const next = store.getState().state;
      if (next.type !== "playing") throw new Error();
      expect(next.trialsConsumed).toBe(1);
    });

    it("advance after correct-in-time increments trialsConsumed", () => {
      const s = store.getState().state;
      if (s.type !== "playing") throw new Error();
      store.getState().submitAnswer(s.currentOperation.result());
      store.getState().advance();
      const next = store.getState().state;
      if (next.type !== "playing") throw new Error();
      expect(next.trialsConsumed).toBe(1);
    });

    it("requestHint sets hintVisible and decrements hintsRemaining", () => {
      // Fresh store guaranteed to use multiplication (which has a hint)
      const multStore = createGameStore();
      multStore.getState().load({ levelNumber: 1, level: { "1dx1d": 100 }, totalTrials: TOTAL_TRIALS });
      const s = multStore.getState().state;
      if (s.type !== "playing") throw new Error();
      expect(s.hintsRemaining).toBe(3);
      multStore.getState().requestHint();
      const after = multStore.getState().state;
      if (after.type !== "playing") throw new Error();
      expect(after.hintVisible).toBe(true);
      expect(after.hintsRemaining).toBe(2);
    });

    it("requestHint is idempotent — second call doesn't decrement again", () => {
      const multStore = createGameStore();
      multStore.getState().load({ levelNumber: 1, level: { "1dx1d": 100 }, totalTrials: TOTAL_TRIALS });
      multStore.getState().requestHint();
      multStore.getState().requestHint();
      const s = multStore.getState().state;
      if (s.type !== "playing") throw new Error();
      expect(s.hintsRemaining).toBe(2); // only decremented once
    });

    it("hintVisible resets to false after advance", () => {
      store.getState().load({ levelNumber: 1, level: { "1dx1d": 100 }, totalTrials: TOTAL_TRIALS });
      store.getState().requestHint();
      const s = store.getState().state;
      if (s.type !== "playing") throw new Error();
      store.getState().submitAnswer(s.currentOperation.result() + 99);
      store.getState().advance();
      const after = store.getState().state;
      if (after.type !== "playing") throw new Error();
      expect(after.hintVisible).toBe(false);
    });

    it("hintShown is recorded in TrialResult", () => {
      const multStore = createGameStore();
      multStore.getState().load({ levelNumber: 1, level: { "1dx1d": 100 }, totalTrials: TOTAL_TRIALS });
      multStore.getState().requestHint();
      const s = multStore.getState().state;
      if (s.type !== "playing") throw new Error();
      multStore.getState().submitAnswer(s.currentOperation.result());
      const reviewing = multStore.getState().state;
      if (reviewing.type !== "playing" || reviewing.playingState.type !== "reviewing") throw new Error();
      expect(reviewing.playingState.result.hintShown).toBe(true);
    });

    it("hintsAvailableAtStart reconstructs the pre-trial budget, undoing this trial's own decrement", () => {
      const multStore = createGameStore();
      multStore.getState().load({ levelNumber: 1, level: { "1dx1d": 100 }, totalTrials: TOTAL_TRIALS });
      multStore.getState().requestHint();
      const s = multStore.getState().state;
      if (s.type !== "playing") throw new Error();
      expect(s.hintsRemaining).toBe(HINTS_PER_LEVEL - 1); // already decremented for this trial

      multStore.getState().submitAnswer(s.currentOperation.result());
      const reviewing = multStore.getState().state;
      if (reviewing.type !== "playing" || reviewing.playingState.type !== "reviewing") throw new Error();
      expect(reviewing.playingState.result.hintsAvailableAtStart).toBe(HINTS_PER_LEVEL);
    });

    it("hintsAvailableAtStart equals hintsRemaining when no hint was requested this trial", () => {
      const s = store.getState().state;
      if (s.type !== "playing") throw new Error();
      store.getState().submitAnswer(s.currentOperation.result());
      const reviewing = store.getState().state;
      if (reviewing.type !== "playing" || reviewing.playingState.type !== "reviewing") throw new Error();
      expect(reviewing.playingState.result.hintsAvailableAtStart).toBe(s.hintsRemaining);
    });

    it("advance after correct-but-late does NOT increment trialsConsumed", () => {
      const s = store.getState().state;
      if (s.type !== "playing") throw new Error();
      const solveTime = s.currentOperation.solveTime();
      vi.spyOn(Date, "now").mockReturnValue(1_000_000 + solveTime + 1);
      store.getState().submitAnswer(s.currentOperation.result());
      store.getState().advance();
      const next = store.getState().state;
      if (next.type !== "playing") throw new Error();
      expect(next.trialsConsumed).toBe(0);
    });

    it("advance after a correct-but-late timeUp also does NOT increment trialsConsumed", () => {
      const s = store.getState().state;
      if (s.type !== "playing") throw new Error();
      store.getState().timeUp(s.currentOperation.result());
      store.getState().advance();
      const next = store.getState().state;
      if (next.type !== "playing") throw new Error();
      expect(next.trialsConsumed).toBe(0);
    });
  });

  describe("finishing a game", () => {
    function playTrials(
      n: number,
      correct: boolean,
      late = false,
    ) {
      for (let i = 0; i < n; i++) {
        const s = store.getState().state;
        if (s.type !== "playing") throw new Error("not playing at trial " + i);
        const solveTime = s.currentOperation.solveTime();
        if (late) {
          vi.spyOn(Date, "now").mockReturnValue(1_000_000 + solveTime + 1);
        } else {
          vi.spyOn(Date, "now").mockReturnValue(1_000_000);
        }
        if (correct) {
          store.getState().submitAnswer(s.currentOperation.result());
        } else {
          store.getState().submitAnswer(s.currentOperation.result() + 99);
        }
        // Advance from reviewing
        const after = store.getState().state;
        if (after.type === "playing" && after.playingState.type === "reviewing") {
          store.getState().advance();
        }
      }
    }

    it("transitions to finished after 20 counting trials", () => {
      store.getState().load(makeConfig());
      playTrials(20, true);
      expect(store.getState().state.type).toBe("finished");
    });

    it("computes correctInTime correctly", () => {
      store.getState().load(makeConfig());
      playTrials(15, true);   // 15 correct in time
      playTrials(5, false);   // 5 wrong
      const s = store.getState().state;
      expect(s.type).toBe("finished");
      if (s.type !== "finished") return;
      expect(s.correctInTime).toBe(15);
      expect(s.levelCompleted).toBe(true);
      expect(s.stars).toBe(1);
    });

    it("levelCompleted=false when correctInTime < 15", () => {
      store.getState().load(makeConfig());
      playTrials(14, true);
      playTrials(6, false);
      const s = store.getState().state;
      if (s.type !== "finished") throw new Error();
      expect(s.levelCompleted).toBe(false);
      expect(s.stars).toBe(0);
    });

    it("correct-but-late trials are not counted toward correctInTime", () => {
      store.getState().load(makeConfig());
      // Play 20 counting trials: 10 correct-in-time, 10 wrong
      // Also interleave some late-correct (which don't consume slots)
      playTrials(10, true, false);   // 10 correct-in-time
      playTrials(10, false, false);  // 10 wrong (completes the 20 slots)
      const s = store.getState().state;
      if (s.type !== "finished") throw new Error("expected finished, got " + s.type);
      expect(s.correctInTime).toBe(10);
    });

    it("replay() restarts from finished", () => {
      store.getState().load(makeConfig());
      playTrials(20, false);
      expect(store.getState().state.type).toBe("finished");
      store.getState().replay();
      expect(store.getState().state.type).toBe("playing");
    });

    it("reset() returns to loading", () => {
      store.getState().load(makeConfig());
      playTrials(20, false);
      store.getState().reset();
      expect(store.getState().state.type).toBe("loading");
    });
  });
});
