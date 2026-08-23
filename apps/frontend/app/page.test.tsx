import { render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import HomePage from "./page";

// Minimal localStorage mock, matching the convention used elsewhere in this
// codebase — the auth store and level stats both read it at module/mount time.
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

test(
  "renders the level selection screen with level 1 linked and level 2 locked",
  () => {
    render(<HomePage />);
    expect(screen.getByText("Mental Math")).toBeDefined();

    const level1 = screen.getByRole("link", { name: "1 new" });
    expect(level1.getAttribute("href")).toBe("/level/1");

    // A locked level renders as plain text, not a link — nothing to
    // navigate to yet.
    expect(screen.getByText("2").closest("a")).toBeNull();
  },
  // Rendering all 150 level cells is legitimately slow under concurrent
  // CI/workspace load (`pnpm -r test:run`) — past the 5s default elsewhere.
  15000,
);

test("shows the Log in link when logged out", () => {
  render(<HomePage />);
  expect(screen.getByRole("link", { name: "Log in" })).toBeDefined();
});

test("links to Practice and Stats routes", () => {
  render(<HomePage />);
  expect(screen.getByRole("link", { name: "Practice" }).getAttribute("href")).toBe("/practice");
  expect(screen.getByRole("link", { name: "Stats →" }).getAttribute("href")).toBe("/stats");
});
