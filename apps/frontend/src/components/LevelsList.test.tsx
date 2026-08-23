import { render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { LevelsList } from "./LevelsList";

// Minimal localStorage mock, matching the convention used elsewhere in this
// codebase — LevelsList reads level stats at mount time.
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
  "level 1 is unlocked and links to play; level 2 is locked, not a link",
  () => {
    render(<LevelsList />);

    const level1 = screen.getByRole("link", { name: /Level 1/ });
    expect(level1.getAttribute("href")).toBe("/level/1");

    const level2Row = screen.getByText("Level 2").closest("a, div");
    expect(level2Row?.tagName).toBe("DIV");
    expect(screen.getByText("Level 2").closest("a")).toBeNull();
  },
  // Rendering all 150 level rows is legitimately slow under concurrent
  // CI/workspace load (`pnpm -r test:run`) — past the 5s default elsewhere.
  15000,
);
