"use client";

import { Fragment, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { computeHistogram, type StatsTrial } from "../stats/computeStats";
import {
  computeOperationStats,
  errorRateBucket,
  findConfusions,
  type ErrorRateBucket,
} from "../stats/operationStats";
import { weeklyCategoryTrend, type TrendTrial } from "../stats/activityStats";
import { formatSeconds } from "../formatTime";
import { panel, backLink } from "../styles";

type Props = {
  codename: string;
  trials: (StatsTrial & TrendTrial)[];
  onBack: () => void;
};

/** Ordinal fill per error-rate bin. Misses step one hue (danger) light →
 *  dark — the light end clears 2:1 on the panel (danger/50 ≈ 2.3:1, /75 ≈
 *  3.5:1, solid 4.7:1). A clean record is teal (the correct-result color),
 *  so "never missed" can't be mistaken for "never tried", which recedes to
 *  the border gray. Static class strings so Tailwind generates them. */
const BUCKET_FILL: Record<ErrorRateBucket, string> = {
  untried: "bg-subtle",
  none: "bg-teal/70",
  low: "bg-danger/50",
  mid: "bg-danger/75",
  high: "bg-danger",
};

const LEGEND = [
  { bucket: "untried", label: "heatmapUntried" },
  { bucket: "none", label: "heatmapNone" },
  { bucket: "low", label: "heatmapLow" },
  { bucket: "mid", label: "heatmapMid" },
  { bucket: "high", label: "heatmapHigh" },
] as const;

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

  const [selected, setSelected] = useState<string | null>(null);

  if (domain.length === 0) return null;

  // Both mirrors of a fact ({6,7} and {7,6}) read the same record.
  const lookup = (row: number, col: number) => {
    const [a, b] = [row, col].sort((x, y) => x - y);
    return { a, b, op: byOp.get(`${a}|${b}`) };
  };

  const readout = (() => {
    if (selected === null) return t("heatmapHint");
    const [row, col] = selected.split("|").map(Number);
    const { a, b, op } = lookup(row, col);
    const label = `${a} × ${b}`;
    return op && op.attempts > 0
      ? t("heatmapCell", {
          op: label,
          errors: op.errors,
          attempts: op.attempts,
        })
      : t("heatmapCellUntried", { op: label });
  })();

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted-2 uppercase tracking-wider font-medium">
        {t("errorHeatmap")}
      </p>
      {/* Cells shrink below the 44px touch floor on narrow panels, so they
          aren't individual controls — the grid is the tap surface and reads
          out the tapped cell below (same pattern as ActivityCalendar).
          Screen readers get the hidden table instead. */}
      <div
        className="grid gap-0.5 justify-center items-center touch-manipulation"
        style={{
          // Cap the column width — an unbounded 1fr lets a two-operand
          // history grow ~200px cells (#82). justify-center keeps the grid
          // balanced when the capped tracks don't fill the panel.
          gridTemplateColumns: `auto repeat(${domain.length}, minmax(0, 44px))`,
        }}
        role="img"
        aria-label={t("errorHeatmap")}
        onClick={(e) => {
          const cell = (e.target as HTMLElement).dataset.cell;
          if (cell) setSelected(cell);
        }}
      >
        <span className="text-2xs text-disabled font-mono text-center pr-1">
          ×
        </span>
        {domain.map((d) => (
          <span
            key={d}
            className="text-2xs text-muted-2 font-mono text-center pb-0.5"
          >
            {d}
          </span>
        ))}
        {domain.map((row) => (
          <Fragment key={row}>
            <span className="text-2xs text-muted-2 font-mono text-right pr-1">
              {row}
            </span>
            {domain.map((col) => {
              const { op } = lookup(row, col);
              const bucket = errorRateBucket(
                op?.errors ?? 0,
                op?.attempts ?? 0,
              );
              const key = `${row}|${col}`;
              return (
                <div
                  key={key}
                  data-cell={key}
                  className={`aspect-square rounded-sm ${BUCKET_FILL[bucket]} ${
                    selected === key
                      ? "ring-2 ring-foreground ring-offset-1 ring-offset-panel"
                      : ""
                  }`}
                />
              );
            })}
          </Fragment>
        ))}
      </div>
      <ul
        aria-label={t("heatmapLegend")}
        className="flex flex-wrap justify-center gap-x-3 gap-y-1"
      >
        {LEGEND.map(({ bucket, label }) => (
          <li
            key={bucket}
            className={`inline-flex items-center gap-1 text-2xs text-muted-2 ${
              bucket === "untried" ? "" : "font-mono"
            }`}
          >
            <span
              aria-hidden="true"
              className={`h-2.5 w-2.5 rounded-sm ${BUCKET_FILL[bucket]}`}
            />
            {t(label)}
          </li>
        ))}
      </ul>
      {/* min-h reserves the line so tapping a cell doesn't shift layout */}
      <p className="min-h-4 text-center text-2xs text-muted-2">{readout}</p>
      {/* role="img" flattens the colored cells to their label — the same
          data stays reachable as a real (visually hidden) table. */}
      <table className="sr-only">
        <caption>{t("errorHeatmap")}</caption>
        <tbody>
          {[...byOp.values()]
            .filter((op) => op.attempts > 0)
            .map((op) => (
              <tr key={op.operands.join("|")}>
                <th scope="row">{op.operands.join(" × ")}</th>
                <td>
                  {t("wrongOfAttempts", {
                    errors: op.errors,
                    attempts: op.attempts,
                  })}
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

/** Minimal weekly sparkline — an SVG polyline plus a "first → last" caption.
 *  The polyline conveys direction; exact values stay out (dense rows carry
 *  numbers elsewhere). */
function Spark({
  label,
  values,
  format,
}: {
  label: string;
  values: number[];
  format: (v: number) => string;
}) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const span = Math.max(...values) - min || 1;
  const W = 100;
  const H = 28;
  const P = 2;
  const points = values
    .map((v, i) => {
      const x = P + (i / (values.length - 1)) * (W - 2 * P);
      const y = H - P - ((v - min) / span) * (H - 2 * P);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <div className="flex flex-col gap-1">
      <span className="text-2xs text-muted-2 uppercase tracking-wider">
        {label}
      </span>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-7"
        role="img"
        aria-label={label}
        preserveAspectRatio="none"
      >
        <polyline
          points={points}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <span className="inline-flex items-center gap-1 text-2xs text-muted-2 font-mono">
        {format(values[0])}
        <ArrowRight size={10} aria-hidden="true" />
        {format(values[values.length - 1])}
      </span>
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
  const trend = useMemo(
    () => weeklyCategoryTrend(trials, codename),
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
          <ArrowLeft size={20} aria-hidden="true" />
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

      {trend.length >= 2 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-2 uppercase tracking-wider font-medium">
            {t("trendTitle")}
          </p>
          <div className="grid grid-cols-2 gap-4">
            <Spark
              label={t("trendAccuracy")}
              values={trend.map((w) => w.correctRate)}
              format={(v) => `${Math.round(v * 100)}%`}
            />
            <Spark
              label={t("trendAvgTime")}
              values={trend
                .map((w) => w.avgCorrectTimeMs)
                .filter((v): v is number => v !== null)}
              format={formatSeconds}
            />
          </div>
        </div>
      )}

      {/* Response time distribution. A category with zero trials keeps the
          page-level empty state (with a practice link, #35); a category with
          trials but zero correct keeps the section heading and gets a
          chart-scoped message — the centered link-less block used to read as
          a page-level empty state above the populated heatmap (#81). */}
      {categoryTrials.length === 0 ? (
        <p className="text-center text-muted-2 py-8">
          {t.rich("noTrialsYet", {
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
          {buckets.length === 0 ? (
            <p className="text-sm text-muted-2">{t("noCorrectTrials")}</p>
          ) : (
            buckets.map((bucket) => (
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
            ))
          )}
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
                    ` · ${formatSeconds(op.avgCorrectTimeMs)}`}
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
