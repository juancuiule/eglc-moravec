"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useLiveRxQuery } from "rxdb/plugins/react";
import { Api } from "@/api/Api";
import { loadLevelStats, isLevelUnlocked, type PersistedLevelStats } from "@/storage/levelStats";
import { formatDuration } from "@/formatTime";
import { panel, backLink } from "@/styles";
import type { LevelDocType } from "@/levels/schema";

// Module-level, not inline in the component: useLiveRxQuery's internal
// subscription only re-runs when this object's identity changes, so a
// fresh `{ selector: {} }` literal on every render would resubscribe every
// render, forever (each subscription's first emission triggers a
// setState-driven re-render, which creates the next fresh literal).
const ALL_LEVELS_QUERY = { selector: {} };

function RowStars({ stars, light }: { stars: 0 | 1 | 2 | 3; light?: boolean }) {
  return (
    <span className="text-sm shrink-0">
      {[1, 2, 3].map((n) =>
        n <= stars ? (
          <span key={n} className={light ? "text-white" : "text-accent"}>
            ★
          </span>
        ) : (
          <span key={n} className={light ? "text-white/70" : "text-disabled"}>
            ☆
          </span>
        ),
      )}
    </span>
  );
}

export function LevelsList() {
  const [stats, setStats] = useState<PersistedLevelStats>({});

  useEffect(() => {
    setStats(loadLevelStats());
  }, []);

  // Level numbers come from the backend's catalog — content that
  // can change without a frontend rebuild — not a static bundled map.
  const { data: fetchedLevelKeys, isLoading, isError } = useQuery({
    queryKey: ["levels"],
    queryFn: Api.fetchLevelNumbers,
  });

  // Falls back to the locally-replicated catalog (see src/levels, src/db)
  // when the live fetch fails — same policy as LevelPlay's own fallback:
  // prefer the live result when it succeeds, only fall back once the fetch
  // has actually failed, not while it's still in flight.
  const { results: localLevels } = useLiveRxQuery<LevelDocType>({
    collection: "levels",
    query: ALL_LEVELS_QUERY,
  });

  useEffect(() => {
    if (isError && localLevels.length > 0) {
      console.warn("Levels: backend unreachable, using the locally-cached catalog.");
    }
  }, [isError, localLevels.length]);

  const levelKeys = useMemo(() => {
    if (fetchedLevelKeys) return fetchedLevelKeys;
    if (isError && localLevels.length > 0) {
      return localLevels.map((doc) => Number(doc.levelNumber)).sort((a, b) => a - b);
    }
    return undefined;
  }, [fetchedLevelKeys, isError, localLevels]);

  const completedCount = Object.keys(stats).filter((k) => (stats[k]?.stars ?? 0) > 0).length;

  return (
    <div className={`${panel} p-6 gap-3`}>
      <div className="flex items-center gap-3">
        <Link href="/" className={backLink} aria-label="Back to menu">
          ←
        </Link>
        <h1 className="text-xl font-bold text-accent">Levels</h1>
      </div>

      {completedCount > 0 && levelKeys && (
        <p className="text-center text-xs text-muted">
          {completedCount} / {levelKeys.length} completed
        </p>
      )}

      {isLoading && !levelKeys && <p className="text-center text-sm text-muted py-8">Loading levels…</p>}
      {isError && !levelKeys && <p className="text-center text-sm text-danger py-8">Couldn't load levels.</p>}

      {levelKeys && (
        <div className="flex flex-col -mx-6 max-h-[60dvh] overflow-y-auto">
          {levelKeys.map((n) => {
            const levelStats = stats[String(n)];
            const unlocked = isLevelUnlocked(n, stats);
            const played = !!levelStats;

            if (!unlocked) {
              return (
                <div
                  key={n}
                  className="flex items-center justify-between px-6 py-3 border-b border-subtle text-disabled"
                >
                  <span className="font-semibold">Level {n}</span>
                  <span>🔒</span>
                </div>
              );
            }

            if (!played) {
              return (
                <Link
                  key={n}
                  href={`/level/${n}`}
                  className="flex flex-col items-center gap-1 px-6 py-3 bg-accent text-white"
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="font-bold">Level {n}</span>
                    <RowStars stars={0} light />
                  </div>
                  <span className="text-sm font-semibold tracking-wide">Play</span>
                </Link>
              );
            }

            return (
              <Link
                key={n}
                href={`/level/${n}`}
                className="flex items-center justify-between gap-2 px-6 py-3 border-b border-subtle hover:bg-base transition-colors"
              >
                <span className="font-semibold text-muted">Level {n}</span>
                <span className="text-teal font-mono text-xs">{formatDuration(levelStats.totalTime)}</span>
                <RowStars stars={levelStats.stars} />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
