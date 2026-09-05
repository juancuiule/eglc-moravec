import { render, type RenderOptions } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement, ReactNode } from "react";
import testMessages from "../../messages/en/index";

export { testMessages };

/**
 * Every screen now reads copy via useTranslations, so any test rendering
 * one needs a NextIntlClientProvider ancestor. Always seeded with the
 * English catalog — tests assert on that literal copy (see the i18n grill
 * session's Q8), same as before this catalog existed.
 */
export function IntlTestProvider({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={testMessages}>
      {children}
    </NextIntlClientProvider>
  );
}

export function renderWithIntl(ui: ReactElement, options?: RenderOptions) {
  const result = render(<IntlTestProvider>{ui}</IntlTestProvider>, options);
  return {
    ...result,
    // RTL's own `rerender` swaps in whatever element it's given as the new
    // root, which would otherwise drop the provider on a bare `rerender(<X />)`
    // call — re-wrap so callers don't have to remember to.
    rerender: (nextUi: ReactElement) =>
      result.rerender(<IntlTestProvider>{nextUi}</IntlTestProvider>),
  };
}
