import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import {
  Addition,
  categoryFromCodename,
  Multiplication,
  type AdditionCategory,
  type MultiplicationCategory,
} from "engine";
import { PracticePlayingScreen } from "./PracticePlayingScreen";
import type { PracticePlaying } from "../practice/index";

const additionCategory = categoryFromCodename("1d+1d") as AdditionCategory;
const multiplicationCategory = categoryFromCodename(
  "2dx1d",
) as MultiplicationCategory;

// Addition never has a hint (NoHint) — used for the hasHint === false case.
const noHintOperation = new Addition(2, 3, additionCategory);
// A two-digit x one-digit multiplication always has a MultiplicationHint.
const hintOperation = new Multiplication(20, 3, multiplicationCategory);

function buildPlaying(
  overrides: Partial<PracticePlaying> = {},
): PracticePlaying {
  return {
    type: "playing",
    config: { categoryCodename: "2dx1d" },
    runId: "run-1",
    results: [],
    currentOperation: hintOperation,
    pickState: undefined,
    trialId: 0,
    playingState: { type: "answering", startedAt: Date.now() },
    hintVisible: false,
    hintsRemaining: undefined,
    ...overrides,
  };
}

function queryHintButton() {
  return screen.queryByRole("button", {
    name: "Hint",
  }) as HTMLButtonElement | null;
}

test("hint button is enabled when the operation has a hint, is hidden, and not reviewing", () => {
  render(<PracticePlayingScreen state={buildPlaying()} />);
  expect(queryHintButton()?.disabled).toBe(false);
});

test("hint button is not rendered when the operation has no hint", () => {
  render(
    <PracticePlayingScreen
      state={buildPlaying({ currentOperation: noHintOperation })}
    />,
  );
  expect(queryHintButton()).toBeNull();
});

test("hint button is disabled once the hint is already visible", () => {
  render(<PracticePlayingScreen state={buildPlaying({ hintVisible: true })} />);
  expect(queryHintButton()?.disabled).toBe(true);
});

test("hint button is disabled while reviewing", () => {
  render(
    <PracticePlayingScreen
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
  expect(queryHintButton()?.disabled).toBe(true);
});
