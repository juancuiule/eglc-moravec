"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Api } from "@/api/Api";
import {
  loadLevelStats,
  isLevelUnlocked,
  type PersistedLevelStats,
} from "@/storage/levelStats";
import { formatDuration } from "@/formatTime";
import { panel, backLink, textLink } from "@/styles";

function RowStars({
  stars,
  light,
  className,
}: {
  stars: 0 | 1 | 2 | 3;
  light?: boolean;
  className?: string;
}) {
  return (
    <span className={`text-sm shrink-0 ${className || ""}`}>
      {" "}
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
  const {
    data: levelKeys,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["levels"],
    queryFn: Api.fetchLevelNumbers,
  });

  const completedCount = Object.keys(stats).filter(
    (k) => (stats[k]?.stars ?? 0) > 0,
  ).length;

  return (
    <div className={`${panel} p-6 gap-3`}>
      <div className="flex items-center gap-3">
        <Link href="/" className={backLink} aria-label="Back to menu">
          ←
        </Link>
        <h1 className="text-xl font-bold tracking-tight">Levels</h1>
      </div>

      {completedCount > 0 && levelKeys && (
        <p className="text-center text-xs text-muted">
          {completedCount} / {levelKeys.length} completed
        </p>
      )}

      {isLoading && (
        <p className="text-center text-sm text-muted py-8">Loading levels…</p>
      )}
      {isError && (
        <div className="flex flex-col items-center gap-2 py-8">
          <p className="text-center text-sm text-danger">
            Couldn't load levels.
          </p>
          <button onClick={() => refetch()} className={`${textLink} underline`}>
            Try again
          </button>
        </div>
      )}

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
                  <span className="text-sm font-semibold tracking-wide">
                    Play
                  </span>
                </Link>
              );
            }

            return (
              <Link
                key={n}
                href={`/level/${n}`}
                className="flex items-center justify-between gap-2 px-6 py-3 border-b border-subtle hover:bg-base transition-color *:flex-1 *:flex"
              >
                <span className="font-semibold text-muted justify-start">
                  Level {n}
                </span>
                <span className="text-teal font-mono text-xs justify-center">
                  {formatDuration(levelStats.totalTime)}
                </span>
                <RowStars className="justify-end" stars={levelStats.stars} />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
