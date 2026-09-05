import { render, screen } from "@testing-library/react";
import { test, vi, expect } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LoginForm } from "./LoginForm";
import { IntlTestProvider } from "@/testUtils/renderWithIntl";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

// Regression test for #30: the email input must have a real accessible
// name (a placeholder alone doesn't count) and the right autocomplete hint.
test("the email input has an accessible name and autocomplete", () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <IntlTestProvider>
      <QueryClientProvider client={client}>
        <LoginForm />
      </QueryClientProvider>
    </IntlTestProvider>,
  );

  const input = screen.getByLabelText("Email");
  expect(input.getAttribute("autocomplete")).toBe("email");
});
