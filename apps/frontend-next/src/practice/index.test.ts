import { describe, it, expect, vi, beforeEach } from "vitest";
import { createPracticeStore } from "./index";

describe("createPracticeStore", () => {
  let store: ReturnType<typeof createPracticeStore>;

  beforeEach(() => {
    store = createPracticeStore();
    vi.spyOn(Date, "now").mockReturnValue(1_000_000);
  });

  it("starts in idle state", () => {
    expect(store.getState().state.type).toBe("idle");
  });

  it("transitions to playing after start()", () => {
    store.getState().start({ categoryCodename: "1d+1d" });
    expect(store.getState().state.type).toBe("playing");
  });

  it("can restart from stopped state", () => {
    store.getState().start({ categoryCodename: "1d+1d" });
    store.getState().stop();
    store.getState().start({ categoryCodename: "1dx1d" });
    expect(store.getState().state.type).toBe("playing");
  });

  describe("while playing", () => {
    beforeEach(() => {
      store.getState().start({ categoryCodename: "1d+1d" });
    });

    it("submitAnswer moves to reviewing", () => {
      const s = store.getState().state;
      if (s.type !== "playing") throw new Error();
      store.getState().submitAnswer(s.currentOperation.result());
      const next = store.getState().state;
      if (next.type !== "playing") throw new Error();
      expect(next.playingState.type).toBe("reviewing");
    });

    it("timeUp moves to reviewing with correct=false", () => {
      store.getState().timeUp();
      const s = store.getState().state;
      if (s.type !== "playing" || s.playingState.type !== "reviewing") throw new Error();
      expect(s.playingState.result.correct).toBe(false);
      expect(s.playingState.result.timeExceeded).toBe(true);
      expect(s.playingState.result.answer).toBeNull();
    });

    it("advance loops back to answering (never finishes)", () => {
      const s0 = store.getState().state;
      if (s0.type !== "playing") throw new Error();
      store.getState().submitAnswer(s0.currentOperation.result());
      store.getState().advance();
      const s1 = store.getState().state;
      expect(s1.type).toBe("playing");
      if (s1.type !== "playing") return;
      expect(s1.playingState.type).toBe("answering");
    });

    it("advance increments trialId", () => {
      const s0 = store.getState().state;
      if (s0.type !== "playing") throw new Error();
      store.getState().submitAnswer(s0.currentOperation.result());
      store.getState().advance();
      const s1 = store.getState().state;
      if (s1.type !== "playing") throw new Error();
      expect(s1.trialId).toBe(1);
    });

    it("stop transitions to stopped with results", () => {
      const s = store.getState().state;
      if (s.type !== "playing") throw new Error();
      store.getState().submitAnswer(s.currentOperation.result());
      store.getState().advance(); // record 1 result
      store.getState().stop();
      const stopped = store.getState().state;
      expect(stopped.type).toBe("stopped");
      if (stopped.type !== "stopped") return;
      expect(stopped.results).toHaveLength(1);
    });

    it("timeout answer is not penalised — still advances normally", () => {
      store.getState().timeUp();
      store.getState().advance();
      const s = store.getState().state;
      expect(s.type).toBe("playing");
      if (s.type !== "playing") return;
      expect(s.playingState.type).toBe("answering");
    });
  });

  describe("stopped state", () => {
    beforeEach(() => {
      store.getState().start({ categoryCodename: "1dx1d" });
      store.getState().stop();
    });

    it("reset returns to idle", () => {
      store.getState().reset();
      expect(store.getState().state.type).toBe("idle");
    });
  });
});
