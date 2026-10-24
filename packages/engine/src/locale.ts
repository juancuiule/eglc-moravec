// The UI locales a Trial can be played in. The frontend's i18n list derives
// from this, so a new UI locale is accepted at the push boundary as soon as
// it ships.
export const LOCALES = ["en", "es"] as const;
export type Locale = (typeof LOCALES)[number];

export function isLocale(value: unknown): value is Locale {
  return (
    typeof value === "string" && (LOCALES as readonly string[]).includes(value)
  );
}
