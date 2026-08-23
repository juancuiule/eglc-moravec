import { render } from "@testing-library/react";
import { expect, test, vi } from "vitest";

const restoreSession = vi.fn().mockResolvedValue(undefined);

vi.mock("./store", () => ({
  authStore: { getState: vi.fn(() => ({ restoreSession })) },
}));

import { AuthBoot } from "./AuthBoot";

test("calls restoreSession once on mount", () => {
  render(<AuthBoot />);
  expect(restoreSession).toHaveBeenCalledTimes(1);
});
