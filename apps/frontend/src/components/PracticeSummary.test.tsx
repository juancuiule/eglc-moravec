import { screen, fireEvent } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { PracticeSummary } from "./PracticeSummary";
import { feedback } from "../feedback";
import type { PracticeStopped } from "../practice/index";
import { renderWithIntl as render } from "@/testUtils/renderWithIntl";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("../feedback", () => ({
  feedback: { key: vi.fn(), select: vi.fn(), success: vi.fn(), error: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

const stoppedState: PracticeStopped = {
  type: "stopped",
  config: { mode: "category", categoryCodename: "1dx1d" },
  runId: "practice-run-1",
  results: [],
};

test("back to menu returns to the practice mode selection, not the home page", () => {
  render(<PracticeSummary state={stoppedState} />);

  fireEvent.click(screen.getByRole("button", { name: "Back to menu" }));

  expect(push).toHaveBeenCalledWith("/practice");
});

test("Back to menu and Practice again each play the select cue", () => {
  render(<PracticeSummary state={stoppedState} />);

  fireEvent.click(screen.getByRole("button", { name: "Back to menu" }));
  fireEvent.click(screen.getByRole("button", { name: /practice again/i }));

  expect(feedback.select).toHaveBeenCalledTimes(2);
});
