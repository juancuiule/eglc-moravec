"use server";

import { cookies } from "next/headers";
import { LOCALE_COOKIE, type Locale } from "./locale";

const MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

/** Persists the player's manual locale choice (see LocaleSwitcher) — client-only
 * per the i18n grill session's Q4, no account/backend sync. */
export async function setLocale(locale: Locale): Promise<void> {
  (await cookies()).set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: MAX_AGE_SECONDS,
    sameSite: "lax",
  });
}
