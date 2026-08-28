import { render, screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";

const { initLocalStorePersistence } = vi.hoisted(() => ({ initLocalStorePersistence: vi.fn() }));

vi.mock("./store", () => ({ initLocalStorePersistence }));

import { StoreBoot } from "./StoreBoot";

test("does not render children until the store has finished loading", async () => {
  let resolveInit!: () => void;
  initLocalStorePersistence.mockReturnValue(new Promise<void>((resolve) => { resolveInit = resolve; }));

  render(
    <StoreBoot>
      <div>ready content</div>
    </StoreBoot>,
  );

  expect(screen.queryByText("ready content")).toBeNull();

  resolveInit();
  await waitFor(() => expect(screen.getByText("ready content")).toBeDefined());
});

test("renders children immediately once the store is already loaded", async () => {
  initLocalStorePersistence.mockResolvedValue(undefined);

  render(
    <StoreBoot>
      <div>ready content</div>
    </StoreBoot>,
  );

  await waitFor(() => expect(screen.getByText("ready content")).toBeDefined());
});
