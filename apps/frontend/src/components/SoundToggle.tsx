"use client";

import { Volume2, VolumeX } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { isFeedbackEnabled, setFeedbackEnabled } from "@/feedback";
import { navLink } from "@/styles";

/**
 * Lives only on the home page header, next to LocaleSwitcher — the one
 * switch that mutes sound (see src/feedback). Optimistic
 * default ON matches isFeedbackEnabled's default, so the useEffect sync
 * with localStorage is a no-op render unless the player turned it off.
 * The switch itself is silent.
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
      aria-label={t("sound")}
      onClick={() => {
        const next = !enabled;
        setEnabled(next);
        setFeedbackEnabled(next);
      }}
      className={`${navLink} inline-flex items-center justify-center min-w-11 ${enabled ? "text-foreground bg-subtle" : ""}`}
    >
      {enabled ? (
        <Volume2 size={16} aria-hidden />
      ) : (
        <VolumeX size={16} aria-hidden />
      )}
    </button>
  );
}
