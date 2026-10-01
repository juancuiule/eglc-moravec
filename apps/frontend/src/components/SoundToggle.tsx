"use client";

import { Volume2, VolumeX } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { feedback, isFeedbackEnabled, setFeedbackEnabled } from "@/feedback";
import { navLink } from "@/styles";

/**
 * Lives only on the home page header, next to LocaleSwitcher — the one
 * switch that mutes both sound and haptics (see src/feedback). Optimistic
 * default ON matches isFeedbackEnabled's default, so the useEffect sync
 * with localStorage is a no-op render unless the player turned it off.
 * data-feedback="off" because it plays its own `toggle` cue when switched
 * on (turning off is silent) — a generic tap on top would double it.
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
      data-feedback="off"
      onClick={() => {
        const next = !enabled;
        setEnabled(next);
        setFeedbackEnabled(next);
        if (next) feedback.toggle();
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
