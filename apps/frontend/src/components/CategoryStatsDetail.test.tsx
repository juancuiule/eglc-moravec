import { screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { CategoryStatsDetail } from "./CategoryStatsDetail";
import type { StatsTrial } from "../stats/computeStats";
import { renderWithIntl as render } from "@/testUtils/renderWithIntl";

// Regression test for #35: the empty state must offer a next action,
// not just describe the gap in prose.
test("the empty state links to practicing this category", () => {
  render(<CategoryStatsDetail codename="1dx1d" trials={[]} onBack={vi.fn()} />);

  const link = screen.getByRole("link", { name: "practice this category" });
  expect(link.getAttribute("href")).toBe("/practice/1dx1d");
});

function makeTrial(overrides: Partial<StatsTrial> = {}): StatsTrial {
  return {
    categoryCodename: "1dx1d",
    operands: [6, 7],
    answer: 42,
    correct: true,
    timeExceeded: false,
    timeTaken: 3000,
    ...overrides,
  };
}

test("shows the recurring confusion with its table neighbor", () => {
  render(
    <CategoryStatsDetail
      codename="1dx1d"
      onBack={vi.fn()}
      trials={[
        makeTrial({ correct: false, answer: 48 }), // 48 for 6×7 is 6×8
        makeTrial({ correct: false, answer: 48 }),
        makeTrial({}),
      ]}
    />,
  );

  expect(
    screen.getByText(/You answered 48 to 6 × 7 — that's 6 × 8/),
  ).toBeDefined();
});

test("does not offer a confusion for errors that aren't table neighbors", () => {
  render(
    <CategoryStatsDetail
      codename="1dx1d"
      onBack={vi.fn()}
      trials={[makeTrial({ correct: false, answer: 40 })]}
    />,
  );

  expect(screen.queryByText(/that's/)).toBeNull();
  // ...but the problem still shows up under Hardest problems.
  expect(screen.getByText("Hardest problems")).toBeDefined();
  expect(screen.getByText("6 × 7")).toBeDefined();
});

test("renders the per-operation error heatmap for 1dx1d only", () => {
  const { rerender } = render(
    <CategoryStatsDetail
      codename="1dx1d"
      onBack={vi.fn()}
      trials={[makeTrial({}), makeTrial({ correct: false, answer: 48 })]}
    />,
  );
  expect(
    screen.getByRole("img", { name: "Error rate by problem" }),
  ).toBeDefined();

  rerender(
    <CategoryStatsDetail
      codename="2dx1d"
      onBack={vi.fn()}
      trials={[
        makeTrial({ categoryCodename: "2dx1d", operands: [12, 5], answer: 60 }),
      ]}
    />,
  );
  expect(
    screen.queryByRole("img", { name: "Error rate by problem" }),
  ).toBeNull();
});
