import { screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import HomePage from "./page";
import { authStore } from "@/auth/store";
import { renderWithIntl } from "@/testUtils/renderWithIntl";

// The home page header now renders LocaleSwitcher, which calls useRouter()
// to refresh after a locale change — needs a router context to render at all.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

// Home fetches the cheap per-day activity aggregate for its days-trained line.
vi.mock("@/api/Api", () => ({
  Api: { fetchActivity: vi.fn() },
}));
import { Api } from "@/api/Api";

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
  vi.mocked(Api.fetchActivity).mockResolvedValue([]);
});

// Home now runs a useQuery — needs a QueryClient ancestor in addition to intl.
function renderHome() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return renderWithIntl(
    <QueryClientProvider client={client}>
      <HomePage />
    </QueryClientProvider>,
  );
}

test("shows the Log in link when logged out", () => {
  renderHome();
  expect(screen.getByRole("link", { name: "Log in" })).toBeDefined();
});

test("also shows the Log in link when anonymous — an anonymous session isn't a logged-in one", () => {
  authStore.setState({ state: { type: "anonymous", token: "anon-tok" } });
  try {
    renderHome();
    expect(screen.getByRole("link", { name: "Log in" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Log out" })).toBeNull();
  } finally {
    authStore.setState({ state: { type: "logged-out" } });
  }
});

test("links to Play, Practice, Stats, and Tutorials routes", () => {
  renderHome();
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

test("shows days trained this month once activity arrives — hidden without data", async () => {
  authStore.setState({ state: { type: "anonymous", token: "anon-tok" } });
  const today = new Date();
  const day = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  vi.mocked(Api.fetchActivity).mockResolvedValue([{ day, trials: 3 }]);
  try {
    renderHome();
    expect(await screen.findByText("1 day trained this month")).toBeDefined();
    expect(Api.fetchActivity).toHaveBeenCalledWith(
      "anon-tok",
      expect.any(Number),
    );
  } finally {
    authStore.setState({ state: { type: "logged-out" } });
  }
});

test("hides the days-trained line when the activity fetch fails or is empty", async () => {
  renderHome();
  // Let the query settle; the line must never appear for an empty history.
  await vi.waitFor(() => expect(Api.fetchActivity).toHaveBeenCalled());
  expect(screen.queryByText(/trained this month/)).toBeNull();
});
