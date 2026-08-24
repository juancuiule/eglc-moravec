import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { TutorialDetail } from "./TutorialDetail";
import { practiceStore } from "../practice/store";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

beforeEach(() => {
  push.mockClear();
  practiceStore.setState({ state: { type: "idle" } });
});

test("multiplication defaults to its most complex category and lets you switch", () => {
  render(<TutorialDetail topic="multiplication" />);

  expect(screen.getByRole("button", { name: "4d × 1d" }).getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByTestId("hint-card")).toBeDefined();
  expect(screen.getByTestId("tutorial-expression").textContent).toMatch(/= \?$/);

  fireEvent.click(screen.getByRole("button", { name: "1d × 1d" }));
  expect(screen.getByRole("button", { name: "1d × 1d" }).getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByRole("button", { name: "4d × 1d" }).getAttribute("aria-pressed")).toBe("false");
});

test("show answer reveals the numeric result", () => {
  render(<TutorialDetail topic="squaring" />);

  expect(screen.getByTestId("tutorial-expression").textContent).toMatch(/= \?$/);

  fireEvent.click(screen.getByRole("button", { name: "Show answer" }));
  expect(screen.getByTestId("tutorial-expression").textContent).toMatch(/= \d+$/);

  fireEvent.click(screen.getByRole("button", { name: "Hide answer" }));
  expect(screen.getByTestId("tutorial-expression").textContent).toMatch(/= \?$/);
});

test("addition has no hint — there's no decomposition trick", () => {
  render(<TutorialDetail topic="addition" />);
  expect(screen.queryByTestId("hint-card")).toBeNull();
});

test("practicing this category starts Practice and navigates there", () => {
  render(<TutorialDetail topic="multiplication" />);

  fireEvent.click(screen.getByRole("button", { name: "1d × 1d" }));
  fireEvent.click(screen.getByRole("button", { name: /Practice 1d × 1d/ }));

  expect(push).toHaveBeenCalledWith("/practice");
  const state = practiceStore.getState().state;
  expect(state.type).toBe("playing");
  expect(state.type === "playing" && state.config.categoryCodename).toBe("1dx1d");
});
