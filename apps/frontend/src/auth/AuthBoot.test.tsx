import { render } from "@testing-library/react";
import { expect, test, vi } from "vitest";

const hydrate = vi.fn();
const ensureSession = vi.fn().mockResolvedValue(undefined);

vi.mock("./store", () => ({
  authStore: { getState: vi.fn(() => ({ hydrate, ensureSession })) },
}));

import { AuthBoot } from "./AuthBoot";

test("hydrates from the session cookie, then ensures a session exists, once on mount", () => {
  render(<AuthBoot />);
  expect(hydrate).toHaveBeenCalledTimes(1);
  expect(ensureSession).toHaveBeenCalledTimes(1);
});
