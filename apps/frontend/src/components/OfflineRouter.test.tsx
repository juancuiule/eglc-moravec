import { authStore } from "@/auth/store";
import { gameStore } from "@/game/store";
import { beforeEach, expect, test, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/api/Api", () => ({
  Api: {
    fetchLevelStats: vi.fn().mockResolvedValue({}),
    syncResults: vi.fn().mockResolvedValue({}),
    fetchTrials: vi.fn().mockResolvedValue([]),
    fetchAllLevels: vi.fn().mockResolvedValue([]),
  },
}));

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OfflineRouter } from "./OfflineRouter";
import { IntlTestProvider } from "@/testUtils/renderWithIntl";
import { localStore, TRIALS_TABLE } from "@/local/store";
import { LEVEL_NUMBERS_VALUE, LEVELS_TABLE } from "@/local/levels";
import { syncStatus } from "@/local/syncEngine";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";

// StatsScreen pulls once per visit via useQuery — same provider setup as
// the app's QueryProvider.
function renderShell(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <IntlTestProvider>
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>
    </IntlTestProvider>,
  );
}

function visit(pathname: string) {
  window.history.pushState({}, "", pathname);
}

beforeEach(() => {
  vi.clearAllMocks();
  window.history.pushState({}, "", "/");
  localStore.delTable(TRIALS_TABLE);
  localStore.delTable(LEVELS_TABLE);
  localStore.delValue(LEVEL_NUMBERS_VALUE);
  localStore.setValue("hydrated", true);
  syncStatus.setState({ pullSettledToken: "test-token" });
  gameStore.getState().reset();
  authStore.setState({ state: { type: "anonymous", token: "test-token" } });
});

test("routes a level URL to the local-data play screen", () => {
  visit("/level/1");
  localStore.setRow(LEVELS_TABLE, "1", { mix: '{"1d+1d":100}' });
  localStore.setValue(LEVEL_NUMBERS_VALUE, "[1,2]");

  renderShell(<OfflineRouter />);

  const state = gameStore.getState().state;
  expect(state.type).toBe("playing");
  if (state.type === "playing") expect(state.config.levelNumber).toBe(1);
});

test("routes /levels to the catalog-backed list", () => {
  visit("/levels");
  localStore.setValue(LEVEL_NUMBERS_VALUE, "[1,2]");

  const { getByText } = renderShell(<OfflineRouter />);
  expect(getByText("Levels")).toBeDefined();
});

test("routes /stats to the local read-model screen", () => {
  visit("/stats");
  const { getByText } = renderShell(<OfflineRouter />);
  expect(getByText("Statistics")).toBeDefined();
});

test("routes / and unroutable paths to the home menu", () => {
  visit("/tutorials");
  const { getByText } = renderShell(<OfflineRouter />);
  expect(getByText("Moravec")).toBeDefined();
});
