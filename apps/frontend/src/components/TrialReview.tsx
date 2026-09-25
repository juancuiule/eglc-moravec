"use client";

import { useTranslations } from "next-intl";
import type { TrialResult } from "engine";
import { formatSeconds } from "@/formatTime";

type Props = { results: TrialResult[] };

export function TrialReview({ results }: Props) {
  const t = useTranslations("Levels");

  return (
    <div
      // overflow-y:auto makes overflow-x compute to auto too — clip it so a
      // scrollbar never appears, and let the fluid column shrink instead.
      className="flex flex-col gap-1 max-h-56 overflow-y-auto overflow-x-hidden"
      role="table"
      aria-label={t("reviewTitle")}
    >
      <div
        role="row"
        className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-4 text-2xs text-muted-2 uppercase tracking-wider px-1 pb-1"
      >
        <span role="columnheader">{t("reviewProblem")}</span>
        <span role="columnheader" className="text-right">
          {t("reviewAnswer")}
        </span>
        <span role="columnheader" className="w-10 text-right">
          {t("reviewTime")}
        </span>
      </div>
      {results.map((r, i) => {
        const correctResult = r.operation.result();
        return (
          <div
            role="row"
            key={i}
            className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-4 items-baseline px-1 py-0.5 rounded hover:bg-base"
          >
            <span role="cell" className="font-mono text-sm truncate">
              {r.operation.humanReadable().replace(" x ", " × ")}
              {r.hintShown && (
                <span className="text-2xs text-muted-2 ml-1.5">
                  {t("reviewHint")}
                </span>
              )}
            </span>
            <span role="cell" className="font-mono text-sm text-right">
              <span
                className={
                  r.correct ? "text-teal font-semibold" : "text-danger"
                }
              >
                {r.answer === null ? "—" : r.answer}
              </span>
              {!r.correct && (
                <span className="text-muted-2 text-xs"> ({correctResult})</span>
              )}
            </span>
            <span
              role="cell"
              className="font-mono text-xs text-muted-2 text-right whitespace-nowrap"
            >
              {formatSeconds(r.timeTaken)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
