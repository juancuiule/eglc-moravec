import { screen, fireEvent } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { PracticeSummary } from "./PracticeSummary";
import type { PracticeStopped } from "../practice/index";
import { renderWithIntl as render } from "@/testUtils/renderWithIntl";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

beforeEach(() => {
  push.mockClear();
});

const stoppedState: PracticeStopped = {
  type: "stopped",
  config: { categoryCodename: "1dx1d" },
  runId: "practice-run-1",
  results: [],
};

test("back to menu returns to the practice mode selection, not the home page", () => {
  render(<PracticeSummary state={stoppedState} />);

  fireEvent.click(screen.getByRole("button", { name: "Back to menu" }));

  expect(push).toHaveBeenCalledWith("/practice");
});
