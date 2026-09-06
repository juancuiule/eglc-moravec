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
