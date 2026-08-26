import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { StatsScreen } from "./StatsScreen";

const store: Record<string, string> = {};
const localStorageMock = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, val: string) => {
    store[key] = val;
  },
  removeItem: (key: string) => {
    delete store[key];
  },
  clear: () => {
    for (const k in store) delete store[k];
  },
};

beforeEach(() => {
  localStorageMock.clear();
  vi.stubGlobal("localStorage", localStorageMock);
});

test("a category row with data is a real button, keyboard-reachable and screen-reader visible", async () => {
  localStorageMock.setItem(
    "moravec:trialHistory",
    JSON.stringify([
      { categoryCodename: "1d+1d", correct: true, timeExceeded: false, timeTaken: 1000 },
    ]),
  );

  render(<StatsScreen />);

  const row = await screen.findByRole("button", { name: /1d\+1d/ });
  expect(row.tagName).toBe("BUTTON");
});

test("a category row with no data is not rendered as an interactive control", async () => {
  // Seed one category with data so the list renders at all, and check a
  // *different*, data-less category's row isn't an interactive control.
  localStorageMock.setItem(
    "moravec:trialHistory",
    JSON.stringify([
      { categoryCodename: "1d+1d", correct: true, timeExceeded: false, timeTaken: 1000 },
    ]),
  );

  render(<StatsScreen />);

  const row = await screen.findByText("1dx1d");
  expect(row.closest("button")).toBeNull();
});

test("the active Level/Practice tab exposes its selected state via aria-pressed, not color alone", () => {
  render(<StatsScreen />);

  const levelTab = screen.getByRole("button", { name: "Level" });
  const practiceTab = screen.getByRole("button", { name: "Practice" });
  expect(levelTab.getAttribute("aria-pressed")).toBe("true");
  expect(practiceTab.getAttribute("aria-pressed")).toBe("false");

  fireEvent.click(practiceTab);

  expect(levelTab.getAttribute("aria-pressed")).toBe("false");
  expect(practiceTab.getAttribute("aria-pressed")).toBe("true");
});

test("the empty state links to a next action, on both tabs", () => {
  render(<StatsScreen />);

  expect(screen.getByRole("link", { name: "complete some levels" }).getAttribute("href")).toBe(
    "/levels",
  );

  fireEvent.click(screen.getByRole("button", { name: "Practice" }));

  expect(screen.getByRole("link", { name: "practice a category" }).getAttribute("href")).toBe(
    "/practice",
  );
});
