import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import {
  Addition,
  categoryFromCodename,
  Multiplication,
  type AdditionCategory,
  type MultiplicationCategory,
} from "engine";
import { AnsweringView } from "./AnsweringView";
import type { Playing } from "../game/index";

const additionCategory = categoryFromCodename("1d+1d") as AdditionCategory;
const multiplicationCategory = categoryFromCodename(
  "2dx1d",
) as MultiplicationCategory;

// Addition never has a hint (NoHint) — used for the hasHint === false cases.
const noHintOperation = new Addition(2, 3, additionCategory);
// A two-digit x one-digit multiplication always has a MultiplicationHint.
const hintOperation = new Multiplication(20, 3, multiplicationCategory);

function buildPlaying(overrides: Partial<Playing> = {}): Playing {
  return {
    type: "playing",
    config: { levelNumber: 1, level: {}, totalTrials: 20 },
    runId: "run-1",
    results: [],
    currentOperation: hintOperation,
    pickState: new Set(),
    trialId: 0,
    playingState: { type: "answering", startedAt: Date.now() },
    hintVisible: false,
    hintsRemaining: 3,
    ...overrides,
  };
}

function hintButtonEl() {
  return screen.getByRole("button", { name: /Hint/ }) as HTMLButtonElement;
}

test("hint button is enabled when the operation has a hint, is hidden, budget remains, and not reviewing", () => {
  render(<AnsweringView state={buildPlaying()} />);
  expect(hintButtonEl().disabled).toBe(false);
});

test("hint button is disabled when the operation has no hint", () => {
  render(
    <AnsweringView
      state={buildPlaying({ currentOperation: noHintOperation })}
    />,
  );
  expect(hintButtonEl().disabled).toBe(true);
});

test("hint button is disabled once the hint is already visible", () => {
  render(<AnsweringView state={buildPlaying({ hintVisible: true })} />);
  expect(hintButtonEl().disabled).toBe(true);
});

test("hint button is disabled when the hint budget is exhausted", () => {
  render(<AnsweringView state={buildPlaying({ hintsRemaining: 0 })} />);
  expect(hintButtonEl().disabled).toBe(true);
});

test("hint button is disabled while reviewing", () => {
  render(
    <AnsweringView
      state={buildPlaying({
        playingState: {
          type: "reviewing",
          result: {
            operation: hintOperation,
            answer: 60,
            correct: true,
            timeExceeded: false,
            hintShown: false,
            timeTaken: 1000,
          },
        },
      })}
    />,
  );
  expect(hintButtonEl().disabled).toBe(true);
});
