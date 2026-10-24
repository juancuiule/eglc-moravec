import { isLocale, LOCALES, type Locale } from "engine";

export { isLocale, type Locale };
export const locales = LOCALES;
export const defaultLocale: Locale = "en";

/** Separate from SESSION_COOKIE (src/storage/session.ts) — locale is a
 * display preference, not auth state, and persists independently of login. */
export const LOCALE_COOKIE = "moravec_locale";

/** The locale the current page renders in, read from the `<html lang>` the
 * root layout sets. Undefined outside a browser. */
export function documentLocale(): Locale | undefined {
  if (typeof document === "undefined") return undefined;
  const { lang } = document.documentElement;
  return isLocale(lang) ? lang : undefined;
}

/** Picks a supported locale from a raw `Accept-Language` header, used only
 * on a player's very first request before any locale cookie exists. Ranked
 * by each entry's `q` weight (default 1), not by header list order — a
 * browser can list its preferences in any order. */
export function localeFromAcceptLanguage(
  header: string | undefined | null,
): Locale {
  if (!header) return defaultLocale;
  const ranked = header
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.split(";").map((s) => s.trim());
      const q = params.find((p) => p.startsWith("q="))?.slice("q=".length);
      return { tag: tag?.slice(0, 2).toLowerCase(), q: q ? Number(q) : 1 };
    })
    .sort((a, b) => b.q - a.q);
  return ranked.map((entry) => entry.tag).find(isLocale) ?? defaultLocale;
}
