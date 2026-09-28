"use client";

import { useEffect } from "react";
import Link from "next/link";
import { NextIntlClientProvider, useTranslations } from "next-intl";
import { panel, button, linkButton } from "@/styles";
import {
  LOCALE_COOKIE,
  defaultLocale,
  isLocale,
  type Locale,
} from "@/i18n/locale";
import enErrors from "../messages/en/errors.json";
import esErrors from "../messages/es/errors.json";
import enCommon from "../messages/en/common.json";
import esCommon from "../messages/es/common.json";
import "./globals.css";

const MESSAGES = {
  en: { Errors: enErrors, Common: enCommon },
  es: { Errors: esErrors, Common: esCommon },
};

// This replaces the entire root layout on a root-render failure, so it
// can't rely on RootLayout's NextIntlClientProvider — that tree is exactly
// what broke. Locale is read straight from the cookie (client-only, this
// component only ever renders in the browser) instead of via getLocale().
function readLocaleCookie(): Locale {
  if (typeof document === "undefined") return defaultLocale;
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${LOCALE_COOKIE}=([^;]*)`),
  );
  const value = match?.[1];
  return isLocale(value) ? value : defaultLocale;
}

function GlobalErrorContent({ reset }: { reset: () => void }) {
  const t = useTranslations("Errors");
  const tCommon = useTranslations("Common");
  return (
    <div className={`${panel} p-6 gap-4`}>
      <h1 className="text-xl font-bold tracking-tight">{t("title")}</h1>
      <p className="text-sm text-muted">{t("globalDescription")}</p>
      <div className="flex flex-col gap-2">
        <button className={button({ intent: "primary" })} onClick={reset}>
          {t("tryAgain")}
        </button>
        {/* A persistent crash is otherwise a dead end — always offer the way out. */}
        <Link href="/" className={linkButton({ intent: "ghost" })}>
          {tCommon("backToMenu")}
        </Link>
      </div>
    </div>
  );
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const locale = readLocaleCookie();

  return (
    <html lang={locale}>
      <body className="min-h-dvh bg-base text-foreground font-sans">
        <main className="min-h-dvh flex items-start justify-center pt-12 pb-6 pl-[max(1.5rem,env(safe-area-inset-left))] pr-[max(1.5rem,env(safe-area-inset-right))]">
          <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]}>
            <GlobalErrorContent reset={reset} />
          </NextIntlClientProvider>
        </main>
      </body>
    </html>
  );
}
