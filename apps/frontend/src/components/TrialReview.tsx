"use client";

import { useTranslations } from "next-intl";
import type { TrialResult } from "engine";
import { formatDuration } from "@/formatTime";

type Props = { results: TrialResult[] };

export function TrialReview({ results }: Props) {
  const t = useTranslations("Levels");

  return (
    <div
      className="flex flex-col gap-1 max-h-56 overflow-y-auto"
      role="table"
      aria-label={t("reviewTitle")}
    >
      <div
        role="row"
        className="grid grid-cols-[1fr_auto_auto] gap-x-4 text-2xs text-muted-2 uppercase tracking-wider px-1 pb-1"
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
            className="grid grid-cols-[1fr_auto_auto] gap-x-4 items-baseline px-1 py-0.5 rounded hover:bg-base"
          >
            <span role="cell" className="font-mono text-sm">
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
              className="font-mono text-xs text-muted-2 w-10 text-right"
            >
              {formatDuration(r.timeTaken)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
