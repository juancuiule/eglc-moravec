import { screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import HomePage from "./page";
import { authStore } from "@/auth/store";
import { renderWithIntl as render } from "@/testUtils/renderWithIntl";

// The home page header now renders LocaleSwitcher, which calls useRouter()
// to refresh after a locale change — needs a router context to render at all.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

// Minimal localStorage mock, matching the convention used elsewhere in this
// codebase — the auth store reads it at module/mount time.
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

test("shows the Log in link when logged out", () => {
  render(<HomePage />);
  expect(screen.getByRole("link", { name: "Log in" })).toBeDefined();
});

test("also shows the Log in link when anonymous — an anonymous session isn't a logged-in one", () => {
  authStore.setState({ state: { type: "anonymous", token: "anon-tok" } });
  try {
    render(<HomePage />);
    expect(screen.getByRole("link", { name: "Log in" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Log out" })).toBeNull();
  } finally {
    authStore.setState({ state: { type: "logged-out" } });
  }
});

test("links to Play, Practice, Stats, and Tutorials routes", () => {
  render(<HomePage />);
  expect(screen.getByRole("link", { name: "Play" }).getAttribute("href")).toBe(
    "/levels",
  );
  expect(
    screen.getByRole("link", { name: "Practice" }).getAttribute("href"),
  ).toBe("/practice");
  expect(screen.getByRole("link", { name: "Stats" }).getAttribute("href")).toBe(
    "/stats",
  );
  expect(
    screen.getByRole("link", { name: "Tutorials" }).getAttribute("href"),
  ).toBe("/tutorials");
});
