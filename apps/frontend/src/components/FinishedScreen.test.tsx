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
test("\"Play next level\" is a real link to the next level, not a button", () => {
  render(<FinishedScreen state={finishedState} />);

  const link = screen.getByRole("link", { name: "Play next level (N)" });
  expect(link.getAttribute("href")).toBe("/level/4");
});
