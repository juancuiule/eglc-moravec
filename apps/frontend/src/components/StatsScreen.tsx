import { useState, useMemo } from "react";
import { loadTrialHistory } from "../storage/trialHistory";
import { loadPracticeHistory } from "../storage/practiceHistory";
import { computeStats } from "../stats/computeStats";
import { CategoryStatsDetail } from "./CategoryStatsDetail";

type Props = { onBack: () => void };
type Tab = "level" | "practice";

function formatMs(ms: number): string {
  return (ms / 1000).toFixed(1) + "s";
}

function EffBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = value >= 0.75 ? "#4ade80" : value >= 0.5 ? "#facc15" : "#f87171";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-[#2e2e42] rounded-full overflow-hidden">
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

export function StatsScreen({ onBack }: Props) {
  const [tab, setTab] = useState<Tab>("level");
  const [selected, setSelected] = useState<string | null>(null);

  // Level and Practice trials are never merged — separate histories, separate numbers.
  const levelTrials = useMemo(() => loadTrialHistory(), []);
  const practiceTrials = useMemo(() => loadPracticeHistory(), []);
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
    <div className="bg-[#1a1a24] border border-[#2e2e42] rounded-2xl p-6 w-full max-w-[480px] flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="text-[#a0a0c0] hover:text-white transition-colors text-lg leading-none"
        >
          ←
        </button>
        <h1 className="text-xl font-bold tracking-tight">Statistics</h1>
      </div>

      <div className="flex gap-1 bg-[#0f0f13] rounded-lg p-1">
        {(["level", "practice"] as const).map((t) => (
          <button
            key={t}
            onClick={() => selectTab(t)}
            className={[
              "flex-1 text-sm font-medium py-1.5 rounded-md transition-colors cursor-pointer",
              tab === t ? "bg-[#5a5af0] text-white" : "text-[#a0a0c0] hover:text-white",
            ].join(" ")}
          >
            {t === "level" ? "Level" : "Practice"}
          </button>
        ))}
      </div>

      {!hasAnyData ? (
        <p className="text-center text-[#5a5a80] py-8">
          {tab === "level"
            ? "No data yet — complete some levels to see your stats."
            : "No data yet — practice a category to see your stats."}
        </p>
      ) : (
        <div className="flex flex-col gap-1">
          {/* Header */}
          <div className="grid grid-cols-[6rem_1fr_4rem] gap-2 px-2 pb-1 text-xs text-[#5a5a80] font-medium uppercase tracking-wider">
            <span>Category</span>
            <span>Effectiveness</span>
            <span className="text-right">Avg time</span>
          </div>

          {stats.map((row) => (
            <div
              key={row.codename}
              onClick={() => row.total > 0 && setSelected(row.codename)}
              className={[
                "grid grid-cols-[6rem_1fr_4rem] gap-2 items-center px-2 py-2 rounded-lg bg-[#0f0f13]",
                row.total > 0 ? "cursor-pointer hover:bg-[#1a1a2e]" : "",
              ].join(" ")}
            >
              <span className="font-mono text-sm text-[#e8e8f0]">
                {row.codename}
              </span>

              {row.total === 0 ? (
                <span className="text-xs text-[#3e3e52] col-span-2">
                  No data yet
                </span>
              ) : (
                <>
                  <div className="flex flex-col gap-0.5">
                    <EffBar value={row.effectiveness} />
                    <span className="text-[10px] text-[#5a5a80]">
                      {row.correctInTime} / {row.total} correct in time
                    </span>
                  </div>
                  <span className="text-xs text-right text-[#a0a0c0]">
                    {row.avgTimeMs !== null ? formatMs(row.avgTimeMs) : "—"}
                  </span>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
