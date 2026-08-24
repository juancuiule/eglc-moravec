import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import { disableWarnings } from "rxdb/plugins/dev-mode";

// RxDB's dev-mode plugin prints a one-time console.warn notice about itself
// on the first database it creates — noise in every test that asserts on
// console.warn calls, not a real warning about this app's code.
disableWarnings();

afterEach(() => {
  cleanup();
});
