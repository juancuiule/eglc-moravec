"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { SUPPORTED_CATEGORY_CODENAMES } from "engine";
import { CATEGORY_LABELS } from "../categoryLabels";
import { useLocalTrials } from "../local/hooks";
import { FOCUS_MODE, weakestPracticedCategory } from "../practice/focus";
import { computeStats } from "../stats/computeStats";
import { panel, backLink } from "../styles";

// A client component so the offline app shell can render it inside its
// location.pathname-routed tree — server components can't mount there.
export function PracticeModeSelection() {
  const t = useTranslations("Practice");
  const tCommon = useTranslations("Common");

  // The recommendation is local-first like everything else: derived from
  // the local read model, never the network. undefined until hydrated —
  // no badge rather than a badge computed on an empty-looking store.
  const trials = useLocalTrials();
  const recommended = useMemo(
    () =>
      trials === undefined
        ? null
        : weakestPracticedCategory(computeStats(trials)),
    [trials],
  );

  return (
    <div className={`${panel} p-6 gap-4`}>
      <div className="flex items-center gap-3">
        <Link href="/" className={backLink} aria-label={tCommon("backToMenu")}>
          ←
        </Link>
        <h1 className="text-xl font-bold tracking-tight">{t("heading")}</h1>
      </div>

      <p className="text-sm text-muted">{t("description")}</p>

      <Link
        href={`/practice/${FOCUS_MODE}`}
        className="flex flex-col gap-1 rounded-xl py-3 px-4 bg-panel-accent border border-subtle hover:border-accent transition-all duration-150 cursor-pointer touch-manipulation active:scale-96"
      >
        <span className="text-sm font-semibold text-accent-text">
          {t("focus")}
        </span>
        <span className="text-xs text-muted">{t("focusDescription")}</span>
      </Link>

      <div className="grid grid-cols-3 gap-2">
        {SUPPORTED_CATEGORY_CODENAMES.map((codename) => (
          <Link
            key={codename}
            href={`/practice/${encodeURIComponent(codename)}`}
            className="flex flex-col items-center justify-center rounded-xl py-3 px-2 bg-base border border-subtle hover:border-accent hover:text-accent transition-all duration-150 cursor-pointer touch-manipulation active:scale-96 font-mono text-sm font-semibold"
          >
            <span>{CATEGORY_LABELS[codename] ?? codename}</span>
            {/* min-h keeps every tile the same height whether or not the
                badge line has content — the badge arriving post-hydration
                must not shift the grid. */}
            <span className="min-h-4 text-2xs font-sans font-normal text-accent-text">
              {codename === recommended ? t("recommended") : null}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
