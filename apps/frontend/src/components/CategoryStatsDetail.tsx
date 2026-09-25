"use client";

import { Fragment, useMemo } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { computeHistogram, type StatsTrial } from "../stats/computeStats";
import { computeOperationStats, findConfusions } from "../stats/operationStats";
import { panel, backLink } from "../styles";

type Props = {
  codename: string;
  trials: StatsTrial[];
  onBack: () => void;
};

/** 1dx1d-only view: error rate per operand pair, symmetric across the
 * diagonal since {a,b} and {b,a} are the same memorized fact. Axis values
 * are the operand digits actually seen in history (2–9 once played enough). */
function OperationHeatmap({
  codename,
  trials,
}: {
  codename: string;
  trials: StatsTrial[];
}) {
  const t = useTranslations("Stats.detail");
  const domain = useMemo(
    () =>
      [
        ...new Set(
          trials
            .filter((t) => t.categoryCodename === codename)
            .flatMap((t) => t.operands),
        ),
      ].sort((a, b) => a - b),
    [trials, codename],
  );
  const byOp = useMemo(
    () =>
      new Map(
        computeOperationStats(trials, codename).map((o) => [
          o.operands.join("|"),
          o,
        ]),
      ),
    [trials, codename],
  );

  if (domain.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted-2 uppercase tracking-wider font-medium">
        {t("errorHeatmap")}
      </p>
      <div
        className="grid gap-0.5"
        style={{
          gridTemplateColumns: `auto repeat(${domain.length}, minmax(0,1fr))`,
        }}
        role="img"
        aria-label={t("errorHeatmap")}
      >
        <span />
        {domain.map((d) => (
          <span key={d} className="text-2xs text-muted-2 text-center">
            {d}
          </span>
        ))}
        {domain.map((row) => (
          <Fragment key={row}>
            <span className="text-2xs text-muted-2 pr-1">{row}</span>
            {domain.map((col) => {
              const [a, b] = [row, col].sort((x, y) => x - y);
              const op = byOp.get(`${a}|${b}`);
              const rate = !op
                ? -1
                : op.attempts === 0
                  ? -1
                  : op.errors / op.attempts;
              return (
                <div
                  key={`${row}${col}`}
                  className="aspect-square rounded-sm"
                  aria-label={
                    op
                      ? `${a} × ${b}: ${t("wrongOfAttempts", {
                          errors: op.errors,
                          attempts: op.attempts,
                        })}`
                      : `${a} × ${b}`
                  }
                  style={{
                    backgroundColor:
                      rate < 0
                        ? "var(--color-subtle)"
                        : rate === 0
                          ? "var(--color-teal)"
                          : "var(--color-danger)",
                    opacity:
                      rate < 0 ? 0.35 : rate === 0 ? 0.3 : 0.25 + rate * 0.75,
                  }}
                />
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

export function CategoryStatsDetail({ codename, trials, onBack }: Props) {
  const t = useTranslations("Stats.detail");
  const buckets = useMemo(
    () => computeHistogram(trials, codename),
    [trials, codename],
  );
  const maxCount = Math.max(1, ...buckets.map((b) => b.count));
  const categoryTrials = trials.filter((t) => t.categoryCodename === codename);
  const correctCount = categoryTrials.filter((t) => t.correct).length;

  const opStats = useMemo(
    () => computeOperationStats(trials, codename),
    [trials, codename],
  );
  const hardest = useMemo(
    () => opStats.filter((o) => o.errors > 0).slice(0, 5),
    [opStats],
  );
  const confusions = useMemo(
    () => findConfusions(trials, codename).slice(0, 4),
    [trials, codename],
  );

  return (
    <div className={`${panel} p-6 gap-4`}>
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className={backLink}
          aria-label={t("backLabel")}
        >
          ←
        </button>
        <h1 className="text-xl font-bold tracking-tight font-mono">
          {codename}
        </h1>
      </div>

      <p className="text-sm text-muted">
        {t("correctTotal", {
          correct: correctCount,
          total: categoryTrials.length,
        })}
      </p>

      {buckets.length === 0 ? (
        <p className="text-center text-muted-2 py-8">
          {t.rich("noCorrectTrials", {
            link: (chunks) => (
              <Link
                href={`/practice/${encodeURIComponent(codename)}`}
                className="underline hover:text-foreground"
              >
                {chunks}
              </Link>
            ),
          })}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-2 uppercase tracking-wider font-medium">
            {t("responseTimeDistribution")}
          </p>
          {buckets.map((bucket) => (
            <div key={bucket.label} className="flex items-center gap-3">
              <span className="text-xs text-muted-2 w-12 text-right font-mono shrink-0">
                {bucket.label}
              </span>
              <div className="flex-1 h-5 bg-base rounded overflow-hidden">
                <div
                  className="h-full bg-accent rounded transition-all"
                  style={{ width: `${(bucket.count / maxCount) * 100}%` }}
                />
              </div>
              <span className="text-xs text-muted w-6 text-right shrink-0">
                {bucket.count}
              </span>
            </div>
          ))}
        </div>
      )}

      {codename === "1dx1d" && (
        <OperationHeatmap codename={codename} trials={trials} />
      )}

      {categoryTrials.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs text-muted-2 uppercase tracking-wider font-medium">
            {t("hardestProblems")}
          </p>
          {hardest.length === 0 ? (
            <p className="text-sm text-muted-2">{t("noMisses")}</p>
          ) : (
            hardest.map((op) => (
              <div
                key={op.key}
                className="flex items-baseline justify-between gap-3 text-sm"
              >
                <span className="font-mono">{op.label}</span>
                <span className="text-muted-2 text-xs">
                  {t("wrongOfAttempts", {
                    errors: op.errors,
                    attempts: op.attempts,
                  })}
                  {op.avgCorrectTimeMs !== null &&
                    ` · ${(op.avgCorrectTimeMs / 1000).toFixed(1)}s`}
                </span>
              </div>
            ))
          )}
        </div>
      )}

      {confusions.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs text-muted-2 uppercase tracking-wider font-medium">
            {t("confusionsTitle")}
          </p>
          {confusions.map((c) => (
            <p key={`${c.asked}|${c.given}`} className="text-sm text-muted">
              {c.neighborLabel
                ? t("confusionNeighbor", {
                    asked: c.asked,
                    given: c.given,
                    neighbor: c.neighborLabel,
                  })
                : t("confusionPlain", { asked: c.asked, given: c.given })}
              {c.count > 1 && (
                <span className="text-muted-2 text-xs"> ×{c.count}</span>
              )}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
