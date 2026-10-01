"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { isFeedbackEnabled, setFeedbackEnabled } from "@/feedback";
import { navLink } from "@/styles";

/**
 * Lives only on the home page header, next to LocaleSwitcher — the one
 * switch that mutes both sound and haptics (see src/feedback). Optimistic
 * default ON matches isFeedbackEnabled's default, so the useEffect sync
 * with localStorage is a no-op render unless the player turned it off.
 */
export function SoundToggle() {
  const t = useTranslations("Common");
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    setEnabled(isFeedbackEnabled());
  }, []);

  return (
    <button
      type="button"
      aria-pressed={enabled}
      onClick={() => {
        const next = !enabled;
        setEnabled(next);
        setFeedbackEnabled(next);
      }}
      className={`${navLink} ${enabled ? "text-foreground bg-subtle" : ""}`}
    >
      {t("sound")}
    </button>
  );
}
