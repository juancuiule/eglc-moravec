import { render, screen } from "@testing-library/react";
import { test, vi, expect } from "vitest";
import { FinishedScreen } from "./FinishedScreen";
import type { Finished } from "../game/index";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const finishedState: Finished = {
  type: "finished",
  config: { levelNumber: 3, level: { "1d+1d": 100 }, totalTrials: 20 },
  runId: "run-1",
  results: [],
  correctCount: 18,
  levelCompleted: true,
  stars: 2,
};

// Regression test for #24: "Play next level" must be a real navigable link
// (Cmd/Ctrl/middle-click, "open in new tab") rather than a button that only
// works via a JS onClick.
test('"Play next level" is a real link to the next level, not a button', () => {
  render(<FinishedScreen state={finishedState} isNewRecord={false} />);

  const link = screen.getByRole("link", { name: "Play next level (N)" });
  expect(link.getAttribute("href")).toBe("/level/4");
});

test("a new record shows the celebration message", () => {
  render(<FinishedScreen state={finishedState} isNewRecord={true} />);

  expect(screen.getByText("New record!")).toBeDefined();
});

test("no celebration message when the run didn't set a new record", () => {
  render(<FinishedScreen state={finishedState} isNewRecord={false} />);

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
    />,
  );

  expect(screen.queryByText("New record!")).toBeNull();
});
