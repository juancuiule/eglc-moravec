import { screen, fireEvent } from "@testing-library/react";
import { test, vi, expect, describe, beforeEach } from "vitest";
import { FinishedScreen } from "./FinishedScreen";
import type { Finished } from "../game/index";
import { renderWithIntl as render } from "@/testUtils/renderWithIntl";
import { Trial, reconstructOperation } from "engine";

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn() }),
}));

beforeEach(() => {
  pushMock.mockClear();
});

const finishedState: Finished = {
  type: "finished",
  config: { levelNumber: 3, level: { "1d+1d": 100 }, totalTrials: 20 },
  runId: "run-1",
  results: [],
  correctCount: 18,
  levelCompleted: true,
  stars: 2,
};

function finishedAt(levelNumber: number): Finished {
  return {
    ...finishedState,
    config: { ...finishedState.config, levelNumber },
  };
}

// Regression test for #24: "Play next level" must be a real navigable link
// (Cmd/Ctrl/middle-click, "open in new tab") rather than a button that only
// works via a JS onClick.
test('"Play next level" is a real link to the next level, not a button', () => {
  render(
    <FinishedScreen
      state={finishedState}
      isNewRecord={false}
      nextLevelNumber={4}
    />,
  );

  const link = screen.getByRole("link", { name: "Play next level (N)" });
  expect(link.getAttribute("href")).toBe("/level/4");
});

describe.each([1, 75])("a completed middle-catalog Level %i", (levelNumber) => {
  test("offers and shortcuts to the explicit next Level", () => {
    render(
      <FinishedScreen
        state={finishedAt(levelNumber)}
        isNewRecord={false}
        nextLevelNumber={levelNumber + 1}
      />,
    );

    const link = screen.getByRole("link", { name: "Play next level (N)" });
    expect(link.getAttribute("href")).toBe(`/level/${levelNumber + 1}`);

    fireEvent.keyDown(window, { key: "n" });
    expect(pushMock).toHaveBeenCalledWith(`/level/${levelNumber + 1}`);
  });
});

test("a completed final active Level offers no next Level and ignores N", () => {
  render(
    <FinishedScreen
      state={finishedAt(150)}
      isNewRecord={false}
      nextLevelNumber={null}
    />,
  );

  expect(
    screen.queryByRole("link", { name: "Play next level (N)" }),
  ).toBeNull();

  fireEvent.keyDown(window, { key: "n" });
  expect(pushMock).not.toHaveBeenCalled();
});

test("a failed run offers no next Level even mid-catalog", () => {
  render(
    <FinishedScreen
      state={{
        ...finishedAt(3),
        levelCompleted: false,
        stars: 0,
        correctCount: 10,
      }}
      isNewRecord={false}
      nextLevelNumber={4}
    />,
  );

  expect(
    screen.queryByRole("link", { name: "Play next level (N)" }),
  ).toBeNull();

  fireEvent.keyDown(window, { key: "n" });
  expect(pushMock).not.toHaveBeenCalled();
});

test("a new record shows the celebration message", () => {
  render(
    <FinishedScreen
      state={finishedState}
      isNewRecord={true}
      nextLevelNumber={4}
    />,
  );

  expect(screen.getByText("New record!")).toBeDefined();
});

test("no celebration message when the run didn't set a new record", () => {
  render(
    <FinishedScreen
      state={finishedState}
      isNewRecord={false}
      nextLevelNumber={4}
    />,
  );

  expect(screen.queryByText("New record!")).toBeNull();
});

test("no celebration message on a failed run, even if isNewRecord is somehow true", () => {
  render(
    <FinishedScreen
      state={{
        ...finishedState,
        levelCompleted: false,
        stars: 0,
        correctCount: 10,
      }}
      isNewRecord={true}
      nextLevelNumber={4}
    />,
  );

  expect(screen.queryByText("New record!")).toBeNull();
});

describe("per-trial review", () => {
  const withResults: Finished = {
    ...finishedState,
    results: [
      Trial.build({
        operation: reconstructOperation("1dx1d", [6, 7]),
        answer: 42,
        timeTaken: 2100,
        hintShown: false,
      }),
      Trial.build({
        operation: reconstructOperation("1dx1d", [6, 8]),
        answer: 47,
        timeTaken: 4200,
        hintShown: true,
      }),
      Trial.build({
        operation: reconstructOperation("(2d)^2", [12]),
        answer: null,
        timeTaken: 16000,
        hintShown: false,
      }),
    ],
  };

  test("is collapsed by default and expands on the toggle", () => {
    render(
      <FinishedScreen
        state={withResults}
        isNewRecord={false}
        nextLevelNumber={4}
      />,
    );

    expect(screen.queryByRole("table")).toBeNull();
    const toggle = screen.getByRole("button", {
      name: "Review your 3 answers",
    });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(toggle);
    expect(screen.getByRole("table")).toBeDefined();
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
  });

  test("shows each trial's problem, answer, correct result on errors, and timeouts", () => {
    render(
      <FinishedScreen
        state={withResults}
        isNewRecord={false}
        nextLevelNumber={4}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Review your/ }));

    expect(screen.getByText("6 × 7")).toBeDefined();
    expect(screen.getByText("42")).toBeDefined();
    expect(screen.getByText("47")).toBeDefined();
    expect(screen.getByText("(48)")).toBeDefined();
    expect(screen.getByText("—")).toBeDefined();
    expect(screen.getByText("(144)")).toBeDefined();
    expect(screen.getByText("hint")).toBeDefined();
  });
});
