import Link from "next/link";
import { Api, type AdminStats, type LevelPerformance, type CategoryPerformance } from "@/api/Api";
import { Centered } from "@/components/Centered";
import { panel, backLink } from "@/styles";

// Without this, Next statically renders this page once at build time
// (fetch() has no dynamic-API usage to opt it out automatically) and bakes
// in whatever the backend returned then — every later visit would show
// that same stale snapshot instead of live data.
export const dynamic = "force-dynamic";

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
    return <p className="text-xs text-muted-2 py-2">No data yet.</p>;
  }
  return (
    <div className="flex flex-col gap-1">
      <div className="grid grid-cols-[6rem_1fr_4rem_3rem] gap-2 px-2 pb-1 text-xs text-muted-2 font-medium uppercase tracking-wider">
        <span></span>
        <span>Effectiveness</span>
        <span className="text-right">Avg time</span>
        <span className="text-right">Users</span>
      </div>
      {rows.map((row) => (
        <div
          key={row.key}
          className="grid grid-cols-[6rem_1fr_4rem_3rem] gap-2 items-center px-2 py-2 rounded-lg bg-base"
        >
          <span className="font-mono text-sm text-foreground">{row.label}</span>
          <span className="text-xs text-muted">
            {formatPct(row.effectiveness)} ({row.attemptCount} attempts)
          </span>
          <span className="text-xs text-right text-muted">{formatMs(row.avgTimeMs)}</span>
          <span className="text-xs text-right text-muted">{row.userCount}</span>
        </div>
      ))}
    </div>
  );
}

export default async function AdminPage() {
  const data: AdminStats | null = await Api.fetchAdminStats().catch(() => null);

  return (
    <Centered>
      <div className={`${panel} p-6 gap-6`}>
        <div className="flex items-center gap-3">
          <Link href="/" className={backLink}>
            ←
          </Link>
          <h1 className="text-xl font-bold tracking-tight">Admin: level performance</h1>
        </div>

        {data === null && (
          <p className="text-center text-danger py-8">Failed to load admin stats.</p>
        )}

        {data !== null && (
          <>
            <section className="flex flex-col gap-2">
              <h2 className="text-xs uppercase tracking-wider text-muted-2 font-medium">By level</h2>
              <StatsTable rows={toLevelRows(data.byLevel)} />
            </section>
            <section className="flex flex-col gap-2">
              <h2 className="text-xs uppercase tracking-wider text-muted-2 font-medium">By category</h2>
              <StatsTable rows={toCategoryRows(data.byCategory)} />
            </section>
          </>
        )}
      </div>
    </Centered>
  );
}
