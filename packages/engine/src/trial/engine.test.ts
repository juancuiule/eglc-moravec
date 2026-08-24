import { describe, it, expect, vi } from "vitest";
import { scoreAnswer, scoreTimeout, evaluateTrial, canShowHint } from "./engine";
import { Addition } from "../operations/operation";

function makeOp() {
  return Addition.create({ type: "addition", codename: "1d+1d", lDigits: 1, rDigits: 1 });
}

describe("evaluateTrial", () => {
  it("marks a correct in-time answer", () => {
    const op = makeOp();
    const result = evaluateTrial(op, op.result(), 0);
    expect(result.correct).toBe(true);
    expect(result.timeExceeded).toBe(false);
  });

  it("marks a wrong answer", () => {
    const op = makeOp();
    const result = evaluateTrial(op, op.result() + 99, 0);
    expect(result.correct).toBe(false);
  });

  it("marks a correct-but-late answer as timeExceeded", () => {
    const op = makeOp();
    const result = evaluateTrial(op, op.result(), op.solveTime() + 1);
    expect(result.correct).toBe(true);
    expect(result.timeExceeded).toBe(true);
  });

  it("marks a null answer (timeout) as not correct", () => {
    const op = makeOp();
    const result = evaluateTrial(op, null, op.solveTime());
    expect(result.correct).toBe(false);
  });
});

describe("scoreAnswer", () => {
  it("marks a correct in-time answer", () => {
    const op = makeOp();
    vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    const result = scoreAnswer(op, 1_000_000, op.result(), { hintShown: false });
    expect(result.correct).toBe(true);
    expect(result.timeExceeded).toBe(false);
    expect(result.timeTaken).toBe(0);
    expect(result.answer).toBe(op.result());
  });

  it("marks a wrong answer", () => {
    const op = makeOp();
    vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    const result = scoreAnswer(op, 1_000_000, op.result() + 99, { hintShown: false });
    expect(result.correct).toBe(false);
  });

  it("marks a correct-but-late answer as timeExceeded", () => {
    const op = makeOp();
    const startedAt = 1_000_000;
    vi.spyOn(Date, "now").mockReturnValue(startedAt + op.solveTime() + 1);
    const result = scoreAnswer(op, startedAt, op.result(), { hintShown: false });
    expect(result.correct).toBe(true);
    expect(result.timeExceeded).toBe(true);
  });

  it("carries through keystrokes, hasErased, and hintShown", () => {
    const op = makeOp();
    vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    const keystrokes = [{ key: "1", t: 10 }];
    const result = scoreAnswer(op, 1_000_000, op.result(), {
      keystrokes,
      hasErased: true,
      hintShown: true,
    });
    expect(result.keystrokes).toBe(keystrokes);
    expect(result.hasErased).toBe(true);
    expect(result.hintShown).toBe(true);
  });

  it("defaults keystrokes and hasErased when omitted", () => {
    const op = makeOp();
    vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    const result = scoreAnswer(op, 1_000_000, op.result(), { hintShown: false });
    expect(result.keystrokes).toEqual([]);
    expect(result.hasErased).toBe(false);
  });
});

describe("scoreTimeout", () => {
  it("marks the trial as wrong, timed out, with a null answer when nothing was typed", () => {
    const op = makeOp();
    const result = scoreTimeout(op, null, { hintShown: false });
    expect(result.correct).toBe(false);
    expect(result.timeExceeded).toBe(true);
    expect(result.answer).toBeNull();
    expect(result.timeTaken).toBe(op.solveTime());
  });

  it("credits a correct answer that was typed but never submitted before time ran out", () => {
    const op = makeOp();
    const result = scoreTimeout(op, op.result(), { hintShown: false });
    expect(result.correct).toBe(true);
    expect(result.timeExceeded).toBe(true);
    expect(result.answer).toBe(op.result());
  });

  it("marks a wrong-but-typed answer as incorrect, not null", () => {
    const op = makeOp();
    const result = scoreTimeout(op, op.result() + 99, { hintShown: false });
    expect(result.correct).toBe(false);
    expect(result.answer).toBe(op.result() + 99);
  });

  it("carries through keystrokes, hasErased, and hintShown", () => {
    const op = makeOp();
    const keystrokes = [{ key: "⌫", t: 5 }];
    const result = scoreTimeout(op, null, { keystrokes, hasErased: true, hintShown: true });
    expect(result.keystrokes).toBe(keystrokes);
    expect(result.hasErased).toBe(true);
    expect(result.hintShown).toBe(true);
  });
});

describe("canShowHint", () => {
  it("rejects when the operation has no hint", () => {
    expect(canShowHint(false, false)).toBe(false);
  });

  it("rejects when a hint is already visible", () => {
    expect(canShowHint(true, true)).toBe(false);
  });

  it("allows unlimited hints when no budget is passed", () => {
    expect(canShowHint(false, true)).toBe(true);
  });

  it("allows a hint when the budget has remaining hints", () => {
    expect(canShowHint(false, true, 1)).toBe(true);
  });

  it("rejects when the budget is exhausted", () => {
    expect(canShowHint(false, true, 0)).toBe(false);
  });
});
