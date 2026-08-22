import { useEffect, useState } from "react";
import {
  fetchAdminStats,
  type AdminStats,
  type LevelPerformance,
  type CategoryPerformance,
} from "../admin/fetchAdminStats";

type Props = { onBack: () => void };

type DisplayRow = {
  key: string;
  label: string;
  attemptCount: number;
  userCount: number;
  effectiveness: number;
  avgTimeMs: number | null;
};

function formatMs(ms: number | null): string {
  return ms === null ? "—" : (ms / 1000).toFixed(1) + "s";
}

function formatPct(v: number): string {
  return Math.round(v * 100) + "%";
}

function toLevelRows(rows: LevelPerformance[]): DisplayRow[] {
  return rows.map((r) => ({ key: `level-${r.levelNumber}`, label: `Level ${r.levelNumber}`, ...r }));
}

function toCategoryRows(rows: CategoryPerformance[]): DisplayRow[] {
  return rows.map((r) => ({ key: `cat-${r.categoryCodename}`, label: r.categoryCodename, ...r }));
}

function StatsTable({ rows }: { rows: DisplayRow[] }) {
  if (rows.length === 0) {
    return <p className="text-xs text-[#5a5a80] py-2">No data yet.</p>;
  }
  return (
    <div className="flex flex-col gap-1">
      <div className="grid grid-cols-[6rem_1fr_4rem_3rem] gap-2 px-2 pb-1 text-xs text-[#5a5a80] font-medium uppercase tracking-wider">
        <span></span>
        <span>Effectiveness</span>
        <span className="text-right">Avg time</span>
        <span className="text-right">Users</span>
      </div>
      {rows.map((row) => (
        <div
          key={row.key}
          className="grid grid-cols-[6rem_1fr_4rem_3rem] gap-2 items-center px-2 py-2 rounded-lg bg-[#0f0f13]"
        >
          <span className="font-mono text-sm text-[#e8e8f0]">{row.label}</span>
          <span className="text-xs text-[#a0a0c0]">
            {formatPct(row.effectiveness)} ({row.attemptCount} attempts)
          </span>
          <span className="text-xs text-right text-[#a0a0c0]">{formatMs(row.avgTimeMs)}</span>
          <span className="text-xs text-right text-[#a0a0c0]">{row.userCount}</span>
        </div>
      ))}
    </div>
  );
}

export function AdminStatsScreen({ onBack }: Props) {
  const [data, setData] = useState<AdminStats | null | "loading">("loading");

  useEffect(() => {
    let cancelled = false;
    fetchAdminStats().then((result) => {
      if (!cancelled) setData(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="bg-[#1a1a24] border border-[#2e2e42] rounded-2xl p-6 w-full max-w-[560px] flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="text-[#a0a0c0] hover:text-white transition-colors text-lg leading-none"
        >
          ←
        </button>
        <h1 className="text-xl font-bold tracking-tight">Admin: level performance</h1>
      </div>

      {data === "loading" && <p className="text-center text-[#5a5a80] py-8">Loading…</p>}
      {data === null && (
        <p className="text-center text-[#f87171] py-8">Failed to load admin stats.</p>
      )}

      {data !== "loading" && data !== null && (
        <>
          <section className="flex flex-col gap-2">
            <h2 className="text-xs uppercase tracking-wider text-[#5a5a80] font-medium">By level</h2>
            <StatsTable rows={toLevelRows(data.byLevel)} />
          </section>
          <section className="flex flex-col gap-2">
            <h2 className="text-xs uppercase tracking-wider text-[#5a5a80] font-medium">By category</h2>
            <StatsTable rows={toCategoryRows(data.byCategory)} />
          </section>
        </>
      )}
    </div>
  );
}
