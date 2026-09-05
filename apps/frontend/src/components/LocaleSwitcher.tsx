"use client";

import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setLocale } from "@/i18n/setLocale";
import { locales, type Locale } from "@/i18n/locale";
import { navLink } from "@/styles";

/**
 * Lives only in the home page header (see the i18n grill session's Q7) —
 * every other screen is a game session someone plays in one sitting, so
 * "go home, switch, come back" is an acceptable cost for keeping the UI
 * footprint small. Language codes ("EN"/"ES") are shown as-is, not
 * translated — they're the one piece of copy meant to read the same in
 * both locales.
 */
export function LocaleSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function choose(next: Locale) {
    if (next === locale || isPending) return;
    startTransition(async () => {
      await setLocale(next);
      router.refresh();
    });
  }

  return (
    <div
      className="flex items-center gap-0.5 text-xs font-medium"
      role="group"
      aria-label="Language"
    >
      {locales.map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => choose(code)}
          aria-pressed={code === locale}
          disabled={isPending}
          className={`${navLink} ${code === locale ? "text-foreground bg-subtle" : ""}`}
        >
          {code.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
