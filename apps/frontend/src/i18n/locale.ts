export const locales = ["en", "es"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";

/** Separate from SESSION_COOKIE (src/storage/session.ts) — locale is a
 * display preference, not auth state, and persists independently of login. */
export const LOCALE_COOKIE = "moravec_locale";

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (locales as readonly string[]).includes(value);
}

/** Picks a supported locale from a raw `Accept-Language` header, used only
 * on a player's very first request before any locale cookie exists. */
export function localeFromAcceptLanguage(
  header: string | undefined | null,
): Locale {
  if (!header) return defaultLocale;
  const preferred = header
    .split(",")
    .map((part) => part.split(";")[0]?.trim().slice(0, 2).toLowerCase());
  return preferred.find(isLocale) ?? defaultLocale;
}
