import { fireEvent, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { CategoryStatsDetail } from "./CategoryStatsDetail";
import type { StatsTrial } from "../stats/computeStats";
import type { TrendTrial } from "../stats/activityStats";
import { renderWithIntl as render } from "@/testUtils/renderWithIntl";

// Regression test for #35: the empty state must offer a next action,
// not just describe the gap in prose.
test("the empty state links to practicing this category", () => {
  render(<CategoryStatsDetail codename="1dx1d" trials={[]} onBack={vi.fn()} />);

  const link = screen.getByRole("link", { name: "practice this category" });
  expect(link.getAttribute("href")).toBe("/practice/1dx1d");
});

function makeTrial(
  overrides: Partial<StatsTrial & TrendTrial> = {},
): StatsTrial & TrendTrial {
  return {
    categoryCodename: "1dx1d",
    operands: [6, 7],
    answer: 42,
    correct: true,
    timeExceeded: false,
    timeTaken: 3000,
    playedAt: 1_700_000_000_000,
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
  const hardest = screen.getByText("Hardest problems").parentElement!;
  expect(within(hardest).getByText("6 × 7")).toBeDefined();
});

// Regression test for #81: a category with trials but zero correct must
// keep the section heading and scope the message to the chart — the old
// centered block read as a page-level empty state above the populated
// heatmap and hardest-problems list.
test("zero correct trials keeps the distribution heading with a scoped message", () => {
  render(
    <CategoryStatsDetail
      codename="1dx1d"
      onBack={vi.fn()}
      trials={[makeTrial({ correct: false, answer: 48 })]}
    />,
  );

  expect(screen.getByText("Response time distribution")).toBeDefined();
  expect(screen.getByText("No correct answers to chart yet.")).toBeDefined();
  // ...and the populated sections below still render.
  expect(screen.getByText("Hardest problems")).toBeDefined();
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

// Regression test for #82: heatmap columns are capped, so a history that
// only spans operands {7,8} renders a compact centered grid instead of two
// ~200px unbounded 1fr cells.
test("the heatmap caps column width for narrow operand domains", () => {
  render(
    <CategoryStatsDetail
      codename="1dx1d"
      onBack={vi.fn()}
      trials={[
        makeTrial({ operands: [7, 8], answer: 56 }),
        makeTrial({ operands: [7, 8], correct: false, answer: 54 }),
      ]}
    />,
  );

  const grid = screen.getByRole("img", { name: "Error rate by problem" });
  expect(grid.style.gridTemplateColumns).toContain("44px");
  expect(grid.style.gridTemplateColumns).not.toContain("1fr");
  expect(grid.className).toContain("justify-center");
});

// The heatmap's color is binned, so a legend must name every bin — color
// can't be the only carrier of what a cell means.
test("the heatmap has a legend naming every error-rate bin", () => {
  render(
    <CategoryStatsDetail
      codename="1dx1d"
      onBack={vi.fn()}
      trials={[makeTrial({}), makeTrial({ correct: false, answer: 48 })]}
    />,
  );

  const legend = screen.getByRole("list", { name: "Error rate legend" });
  const items = within(legend)
    .getAllByRole("listitem")
    .map((li) => li.textContent);
  expect(items).toEqual(["Not tried", "0%", "1–25%", "26–50%", "51–100%"]);
});

// Cells are too small to be individual controls, so tapping the grid reads
// out the tapped cell — the per-cell value must be reachable on touch.
test("tapping a heatmap cell reads out that problem's record", () => {
  render(
    <CategoryStatsDetail
      codename="1dx1d"
      onBack={vi.fn()}
      trials={[makeTrial({}), makeTrial({ correct: false, answer: 48 })]}
    />,
  );

  const grid = screen.getByRole("img", { name: "Error rate by problem" });
  // 7 × 6 is the mirror of 6 × 7 — same fact, same record.
  fireEvent.click(grid.querySelector('[data-cell="7|6"]')!);
  expect(screen.getByText("6 × 7 · 1/2 wrong")).toBeDefined();

  fireEvent.click(grid.querySelector('[data-cell="6|6"]')!);
  expect(screen.getByText("6 × 6 · not tried yet")).toBeDefined();
});

test("shows a weekly trend once the category spans two weeks", () => {
  const week1 = new Date(2026, 7, 18, 12).getTime(); // week of Aug 17
  const week2 = new Date(2026, 7, 26, 12).getTime(); // week of Aug 24
  render(
    <CategoryStatsDetail
      codename="1dx1d"
      onBack={vi.fn()}
      trials={[
        makeTrial({ playedAt: week1 }),
        makeTrial({ playedAt: week1 }),
        makeTrial({ playedAt: week2, correct: false, answer: 48 }),
        makeTrial({ playedAt: week2, correct: false, answer: 48 }),
      ]}
    />,
  );

  expect(screen.getByText("Trend by week")).toBeDefined();
  // 100% correct in week 1, 0% in week 2 → "100% [arrow icon] 0%"
  expect(
    screen.getByText(
      (_, el) => el?.tagName === "SPAN" && el.textContent === "100%0%",
    ),
  ).toBeDefined();
});

test("hides the trend when history fits in a single week", () => {
  render(
    <CategoryStatsDetail
      codename="1dx1d"
      onBack={vi.fn()}
      trials={[makeTrial(), makeTrial({ playedAt: 1_700_100_000_000 })]}
    />,
  );
  expect(screen.queryByText("Trend by week")).toBeNull();
});

test("the heading uses the category's display label, not its codename", () => {
  render(<CategoryStatsDetail codename="2dx1d" onBack={vi.fn()} trials={[]} />);
  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("2d × 1d");
});
