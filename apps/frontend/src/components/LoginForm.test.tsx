import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, test, vi, expect } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import { Api } from "@/api/Api";
import en from "../../messages/en/index";
import es from "../../messages/es/index";
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

afterEach(() => vi.restoreAllMocks());

test.each([
  {
    locale: "en",
    messages: en,
    button: "Send code",
    text: "Too many codes requested. Try again in a few minutes.",
  },
  {
    locale: "es",
    messages: es,
    button: "Enviar código",
    text: "Pediste demasiados códigos. Volvé a intentar en unos minutos.",
  },
])(
  "shows localized rate-limit copy in $locale",
  async ({ locale, messages, button, text }) => {
    vi.spyOn(Api, "requestOtp").mockRejectedValue(new Error("rate_limited"));
    const client = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    render(
      <NextIntlClientProvider locale={locale} messages={messages}>
        <QueryClientProvider client={client}>
          <LoginForm />
        </QueryClientProvider>
      </NextIntlClientProvider>,
    );
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "player@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: button }));
    expect(await screen.findByText(text)).toBeTruthy();
    expect(screen.queryByText("rate_limited")).toBeNull();
  },
);
