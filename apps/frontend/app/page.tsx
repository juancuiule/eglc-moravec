"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/auth/store";
import { LEVELS } from "@/LEVELS";
import { loadLevelStats, isLevelUnlocked, type PersistedLevelStats } from "@/storage/levelStats";
import { Centered } from "@/components/Centered";
import { panel } from "@/styles";

const LEVEL_KEYS = Object.keys(LEVELS).map(Number).sort((a, b) => a - b);

function LevelStars({ stars }: { stars: 0 | 1 | 2 | 3 }) {
  return (
    <span className="text-xs">
      {[1, 2, 3].map((n) => (
        <span key={n} className={n <= stars ? "text-warning" : "text-disabled"}>
          ★
        </span>
      ))}
    </span>
  );
}

const navLinkClassName =
  "text-sm text-muted hover:text-white transition-colors px-2 py-1 rounded-lg hover:bg-subtle";

const levelCellClassName = (unlocked: boolean, played: boolean) =>
  [
    "flex flex-col items-center justify-center rounded-xl py-2 px-1 text-sm font-semibold transition-all",
    unlocked
      ? played
        ? "bg-base border border-subtle hover:border-accent cursor-pointer"
        : "bg-panel-accent border border-subtle-accent hover:border-accent cursor-pointer"
      : "bg-base border border-subtle-muted text-disabled cursor-not-allowed",
  ].join(" ");

export default function HomePage() {
  const authState = useAuth((s) => s.state);
  const logout = useAuth((s) => s.logout);
  const [stats, setStats] = useState<PersistedLevelStats>({});

  useEffect(() => {
    setStats(loadLevelStats());
  }, []);

  return (
    <Centered>
      <div className={`${panel} p-6 max-w-[480px] gap-4`}>
        <div className="flex items-center justify-between flex-wrap gap-y-2">
          <h1 className="text-2xl font-bold tracking-tight whitespace-nowrap">Mental Math</h1>
          <div className="flex items-center gap-1">
            {authState.type === "loggedIn" ? (
              <>
                <span
                  className="text-xs text-accent font-mono max-w-20 truncate"
                  title={authState.email}
                >
                  {authState.email}
                </span>
                <button onClick={logout} className={navLinkClassName}>
                  Log out
                </button>
              </>
            ) : (
              <Link href="/login" className={navLinkClassName}>
                Log in
              </Link>
            )}
            <Link href="/practice" className={navLinkClassName}>
              Practice
            </Link>
            <Link href="/stats" className={navLinkClassName}>
              Stats →
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-5 gap-1.5 max-h-[60dvh] overflow-y-auto pr-1">
          {LEVEL_KEYS.map((n) => {
            const levelStats = stats[String(n)];
            const unlocked = isLevelUnlocked(n, stats);
            const played = !!levelStats;
            const className = levelCellClassName(unlocked, played);

            const content = unlocked ? (
              <>
                <span>{n}</span>
                {played ? (
                  <LevelStars stars={levelStats.stars} />
                ) : (
                  <span className="text-2xs text-accent mt-0.5">new</span>
                )}
              </>
            ) : (
              <>
                <span>{n}</span>
                <span className="text-2xs mt-0.5">🔒</span>
              </>
            );

            return unlocked ? (
              <Link key={n} href={`/level/${n}`} className={className}>
                {content}
              </Link>
            ) : (
              <div key={n} className={className}>
                {content}
              </div>
            );
          })}
        </div>

        {Object.keys(stats).length > 0 && (
          <p className="text-center text-xs text-accent">
            {Object.keys(stats).filter((k) => (stats[k]?.stars ?? 0) > 0).length} / {LEVEL_KEYS.length} levels completed
          </p>
        )}
      </div>
    </Centered>
  );
}
