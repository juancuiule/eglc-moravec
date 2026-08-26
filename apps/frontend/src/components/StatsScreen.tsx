"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { loadTrialHistory, type PersistedTrial } from "../storage/trialHistory";
import { loadPracticeHistory, type PersistedPracticeTrial } from "../storage/practiceHistory";
import { computeStats } from "../stats/computeStats";
import { CategoryStatsDetail } from "./CategoryStatsDetail";
import { panel, backLink } from "../styles";

type Tab = "level" | "practice";

function formatMs(ms: number): string {
  return (ms / 1000).toFixed(1) + "s";
}

function EffBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  // Referencing the theme's own CSS variables instead of repeating their
  // hex values here in JS — see AnsweringPanel's timerColor for the same pattern.
  const color =
    value >= 0.75 ? "var(--color-success)" : value >= 0.5 ? "var(--color-warning)" : "var(--color-danger)";
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
  const [tab, setTab] = useState<Tab>("level");
  const [selected, setSelected] = useState<string | null>(null);

  // Level and Practice trials are never merged — separate histories, separate numbers.
  // Read on mount rather than during render — localStorage isn't available
  // during SSR, and reading it synchronously here would mismatch the
  // server-rendered (empty) HTML against the client's first render.
  const [levelTrials, setLevelTrials] = useState<PersistedTrial[]>([]);
  const [practiceTrials, setPracticeTrials] = useState<PersistedPracticeTrial[]>([]);

  useEffect(() => {
    setLevelTrials(loadTrialHistory());
    setPracticeTrials(loadPracticeHistory());
  }, []);

  const trials = tab === "level" ? levelTrials : practiceTrials;

  const stats = useMemo(() => computeStats(trials), [trials]);
  const hasAnyData = stats.some((s) => s.total > 0);

  if (selected !== null) {
    return <CategoryStatsDetail codename={selected} trials={trials} onBack={() => setSelected(null)} />;
  }

  function selectTab(next: Tab) {
    setTab(next);
    setSelected(null);
  }

  return (
    <div className={`${panel} p-6 gap-4`}>
      <div className="flex items-center gap-3">
        <Link href="/" className={backLink}>
          ←
        </Link>
        <h1 className="text-xl font-bold tracking-tight">Statistics</h1>
      </div>

      <div className="flex gap-1 bg-base rounded-lg p-1">
        {(["level", "practice"] as const).map((t) => (
          <button
            key={t}
            onClick={() => selectTab(t)}
            aria-pressed={tab === t}
            className={[
              "flex-1 text-sm font-medium py-1.5 rounded-md transition-colors cursor-pointer",
              tab === t ? "bg-accent text-white" : "text-muted hover:text-foreground",
            ].join(" ")}
          >
            {t === "level" ? "Level" : "Practice"}
          </button>
        ))}
      </div>

      {!hasAnyData ? (
        <p className="text-center text-muted-2 py-8">
          {tab === "level"
            ? "No data yet — complete some levels to see your stats."
            : "No data yet — practice a category to see your stats."}
        </p>
      ) : (
        <div className="flex flex-col gap-1">
          {/* Header */}
          <div className="grid grid-cols-[6rem_1fr_4rem] gap-2 px-2 pb-1 text-xs text-muted-2 font-medium uppercase tracking-wider">
            <span>Category</span>
            <span>Effectiveness</span>
            <span className="text-right">Avg time</span>
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
                    No data yet
                  </span>
                ) : (
                  <>
                    <div className="flex flex-col gap-0.5">
                      <EffBar value={row.effectiveness} />
                      <span className="text-2xs text-muted-2">
                        {row.correctCount} / {row.total} correct
                      </span>
                    </div>
                    <span className="text-xs text-right text-muted">
                      {row.avgTimeMs !== null ? formatMs(row.avgTimeMs) : "—"}
                    </span>
                  </>
                )}
              </>
            );

            // Only a row with data is actually navigable to the detail view —
            // a real <button> for that (keyboard + screen-reader reachable),
            // a plain <div> for the inert "no data yet" rows.
            return row.total > 0 ? (
              <button key={row.codename} onClick={() => setSelected(row.codename)} className={rowClassName}>
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
    </div>
  );
}
