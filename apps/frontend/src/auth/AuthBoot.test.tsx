import { render } from "@testing-library/react";
import { expect, test, vi } from "vitest";

const hydrate = vi.fn();

vi.mock("./store", () => ({
  authStore: { getState: vi.fn(() => ({ hydrate })) },
}));

import { AuthBoot } from "./AuthBoot";

test("hydrates from the session cookie once on mount, with no network call", () => {
  render(<AuthBoot />);
  expect(hydrate).toHaveBeenCalledTimes(1);
});
