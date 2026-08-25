import { render } from "@testing-library/react";
import { expect, test } from "vitest";
import { useQueryClient } from "@tanstack/react-query";
import { QueryProvider } from "./QueryProvider";

function ReadDefaultRetry({ onRead }: { onRead: (retry: unknown) => void }) {
  onRead(useQueryClient().getDefaultOptions().queries?.retry);
  return null;
}

test("disables query retries by default, so a dead backend fails fast instead of retrying with backoff", () => {
  let retry: unknown;
  render(
    <QueryProvider>
      <ReadDefaultRetry onRead={(r) => (retry = r)} />
    </QueryProvider>,
  );

  expect(retry).toBe(false);
});
