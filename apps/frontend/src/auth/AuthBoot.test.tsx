import { render } from "@testing-library/react";
import { expect, test, vi } from "vitest";

const hydrate = vi.fn();
const restoreSession = vi.fn().mockResolvedValue(undefined);

vi.mock("./store", () => ({
  authStore: { getState: vi.fn(() => ({ hydrate, restoreSession })) },
}));

import { AuthBoot } from "./AuthBoot";

test("hydrates from a persisted session, then validates it, once on mount", () => {
  render(<AuthBoot />);
  expect(hydrate).toHaveBeenCalledTimes(1);
  expect(restoreSession).toHaveBeenCalledTimes(1);
});
