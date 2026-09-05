import { screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { CategoryStatsDetail } from "./CategoryStatsDetail";
import { renderWithIntl as render } from "@/testUtils/renderWithIntl";

// Regression test for #35: the empty state must offer a next action,
// not just describe the gap in prose.
test("the empty state links to practicing this category", () => {
  render(<CategoryStatsDetail codename="1dx1d" trials={[]} onBack={vi.fn()} />);

  const link = screen.getByRole("link", { name: "practice this category" });
  expect(link.getAttribute("href")).toBe("/practice/1dx1d");
});
