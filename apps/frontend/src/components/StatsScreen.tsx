"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { Api } from "../api/Api";
import { authToken, useAuth } from "../auth/store";
import { computeStats } from "../stats/computeStats";
import {
  activityCalendar,
  daysTrainedThisMonth,
  type PlayedTrial,
} from "../stats/activityStats";
import {
  downloadTextFile,
  exportFilename,
  trialsToCsv,
  trialsToJson,
} from "../stats/exportTrials";
import { CategoryStatsDetail } from "./CategoryStatsDetail";
import { formatSeconds } from "../formatTime";
import { useLocalTrials } from "../local/hooks";
import { mergeServerTrials } from "../local/trials";
import { localEpoch } from "../local/store";
import { panel, backLink, button, textLink } from "../styles";

type Tab = "level" | "practice";

/** GitHub-style trailing-weeks calendar of daily trial counts — teal alpha
 *  encodes count, muted for empty days, transparent for future days. */
function ActivityCalendar({ trials }: { trials: PlayedTrial[] }) {
  const t = useTranslations("Stats");
  const weeks = useMemo(() => activityCalendar(trials), [trials]);
  const daysThisMonth = useMemo(() => daysTrainedThisMonth(trials), [trials]);
  const maxCount = Math.max(1, ...weeks.flat().map((c) => c.count));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs text-muted-2 uppercase tracking-wider font-medium">
          {t("activity")}
        </p>
        <span className="text-2xs text-muted-2">
          {t("daysThisMonth", { count: daysThisMonth })}
        </span>
      </div>
      <div
        className="flex justify-center gap-[3px]"
        role="img"
        aria-label={t("activity")}
      >
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-[3px]">
            {week.map((cell) => (
              <div
                key={cell.day}
                className="h-2.5 w-2.5 rounded-sm"
                title={t("activityDay", {
                  count: cell.count,
                  date: cell.day,
                })}
                style={{
                  backgroundColor: cell.future
                    ? "transparent"
                    : cell.count === 0
                      ? "var(--color-subtle-muted)"
                      : "var(--color-teal)",
                  opacity:
                    !cell.future && cell.count > 0
                      ? 0.35 + 0.65 * (cell.count / maxCount)
                      : undefined,
                }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function EffBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  // Referencing the theme's own CSS variables instead of repeating their
  // hex values here in JS — see AnsweringPanel's timerColor for the same pattern.
  const color =
    value >= 0.75
      ? "var(--color-success)"
      : value >= 0.5
        ? "var(--color-warning)"
        : "var(--color-danger)";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-subtle rounded-full overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-xs w-8 text-right" style={{ color }}>
        {pct}%
      </span>
    </div>
  );
}

export function StatsScreen() {
  const t = useTranslations("Stats");
  const tCommon = useTranslations("Common");
  const [tab, setTab] = useState<Tab>("level");
  const [selected, setSelected] = useState<string | null>(null);

  const token = useAuth((s) => authToken(s.state));

  // The local-first store is the read model — stats render offline and
  // immediately after a run, before its push lands. Visiting Stats also
  // triggers a pull that merges server trials into the store, keeping
  // multi-device histories honest until cursor sync arrives.
  const allTrials = useLocalTrials();
  const { isError, refetch } = useQuery({
    queryKey: ["trialsPull", token],
    queryFn: async () => {
      if (!token) return 0;
      // Epoch-guarded: a pull that resolves after a logout wipe must not
      // repopulate the store with the previous session's rows.
      const gen = localEpoch();
      const trials = await Api.fetchTrials(token);
      if (gen === localEpoch()) mergeServerTrials(trials);
      return trials.length;
    },
  });

  const isLoading = allTrials === undefined;

  // Level and Practice trials are never merged — separate histories, separate numbers.
  const trials = useMemo(
    () => (allTrials ?? []).filter((t) => t.runType === tab),
    [allTrials, tab],
  );

  const stats = useMemo(() => computeStats(trials), [trials]);
  const hasAnyData = stats.some((s) => s.total > 0);

  if (selected !== null) {
    return (
      <CategoryStatsDetail
        codename={selected}
        trials={trials}
        onBack={() => setSelected(null)}
      />
    );
  }

  function selectTab(next: Tab) {
    setTab(next);
    setSelected(null);
  }

  return (
    <div className={`${panel} p-6 gap-4`}>
      <div className="flex items-center gap-3">
        <Link href="/" className={backLink} aria-label={tCommon("backToMenu")}>
          ←
        </Link>
        <h1 className="text-xl font-bold tracking-tight">{t("title")}</h1>
      </div>

      <div className="flex gap-1 bg-base rounded-lg p-1">
        {(["level", "practice"] as const).map((tabOption) => (
          <button
            key={tabOption}
            onClick={() => selectTab(tabOption)}
            aria-pressed={tab === tabOption}
            className={[
              "flex-1 text-sm font-medium py-1.5 rounded-md transition-colors cursor-pointer",
              tab === tabOption
                ? "bg-accent text-white"
                : "text-muted hover:text-foreground",
            ].join(" ")}
          >
            {tabOption === "level" ? t("tabLevel") : t("tabPractice")}
          </button>
        ))}
      </div>

      {isLoading && (
        <p className="text-center text-sm text-muted py-8">{t("loading")}</p>
      )}

      {isError && !isLoading && !hasAnyData && (
        <div className="flex flex-col items-center gap-2 py-8">
          <p className="text-center text-sm text-danger">{t("loadError")}</p>
          <button onClick={() => refetch()} className={`${textLink} underline`}>
            {t("tryAgain")}
          </button>
        </div>
      )}

      {!isLoading && !isError && !hasAnyData && (
        <p className="text-center text-muted-2 py-8">
          {tab === "level"
            ? t.rich("noDataLevel", {
                link: (chunks) => (
                  <Link
                    href="/levels"
                    className="underline hover:text-foreground"
                  >
                    {chunks}
                  </Link>
                ),
              })
            : t.rich("noDataPractice", {
                link: (chunks) => (
                  <Link
                    href="/practice"
                    className="underline hover:text-foreground"
                  >
                    {chunks}
                  </Link>
                ),
              })}
        </p>
      )}

      {!isLoading && hasAnyData && <ActivityCalendar trials={trials} />}

      {!isLoading && hasAnyData && (
        <div className="flex flex-col gap-1">
          {/* Header */}
          <div className="grid grid-cols-[6rem_1fr_4rem] gap-2 px-2 pb-1 text-xs text-muted-2 font-medium uppercase tracking-wider">
            <span>{t("columnCategory")}</span>
            <span>{t("columnEffectiveness")}</span>
            <span className="text-right">{t("columnAvgTime")}</span>
          </div>

          {stats.map((row) => {
            const rowClassName = [
              "grid grid-cols-[6rem_1fr_4rem] gap-2 items-center px-2 py-2 rounded-lg bg-base w-full text-left",
              row.total > 0 ? "cursor-pointer hover:bg-panel-accent" : "",
            ].join(" ");

            const content = (
              <>
                <span className="font-mono text-sm text-foreground">
                  {row.codename}
                </span>

                {row.total === 0 ? (
                  <span className="text-xs text-disabled col-span-2">
                    {t("noDataYet")}
                  </span>
                ) : (
                  <>
                    <div className="flex flex-col gap-0.5">
                      <EffBar value={row.effectiveness} />
                      <span className="text-2xs text-muted-2">
                        {t("correctOfTotal", {
                          correct: row.correctCount,
                          total: row.total,
                        })}
                      </span>
                    </div>
                    <span className="text-xs text-right text-muted">
                      {row.avgTimeMs !== null
                        ? formatSeconds(row.avgTimeMs)
                        : "—"}
                    </span>
                  </>
                )}
              </>
            );

            // Only a row with data is actually navigable to the detail view —
            // a real <button> for that (keyboard + screen-reader reachable),
            // a plain <div> for the inert "no data yet" rows.
            return row.total > 0 ? (
              <button
                key={row.codename}
                onClick={() => setSelected(row.codename)}
                className={rowClassName}
              >
                {content}
              </button>
            ) : (
              <div key={row.codename} className={rowClassName}>
                {content}
              </div>
            );
          })}
        </div>
      )}

      {!isLoading && (allTrials?.length ?? 0) > 0 && (
        <div className="border-t border-subtle pt-4 flex flex-col gap-2">
          <p className="text-xs text-muted-2 uppercase tracking-wider font-medium">
            {t("exportTitle")}
          </p>
          <p className="text-sm text-muted">{t("exportBody")}</p>
          <div className="flex gap-2">
            <button
              className={`${button({ intent: "outline" })} flex-1`}
              onClick={() =>
                downloadTextFile(
                  exportFilename("csv"),
                  trialsToCsv(allTrials!),
                  "text/csv",
                )
              }
            >
              {t("exportCsv")}
            </button>
            <button
              className={`${button({ intent: "outline" })} flex-1`}
              onClick={() =>
                downloadTextFile(
                  exportFilename("json"),
                  trialsToJson(allTrials!),
                  "application/json",
                )
              }
            >
              {t("exportJson")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
