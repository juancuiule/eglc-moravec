import { render, screen } from "@testing-library/react";
import { test, vi, expect } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OtpForm } from "./OtpForm";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

// Regression test for #30: the code input must have a real accessible
// name (a placeholder alone doesn't count) and the right autocomplete hint.
test("the code input has an accessible name and autocomplete", () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <OtpForm email="player@example.com" />
    </QueryClientProvider>,
  );

  const input = screen.getByLabelText("6-digit code");
  expect(input.getAttribute("autocomplete")).toBe("one-time-code");
});
