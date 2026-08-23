"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/auth/store";
import { LEVELS } from "@/LEVELS";
import { loadLevelStats, type PersistedLevelStats } from "@/storage/levelStats";
import { Centered } from "@/components/Centered";

const LEVEL_KEYS = Object.keys(LEVELS).map(Number).sort((a, b) => a - b);

function isUnlocked(levelNumber: number, stats: PersistedLevelStats): boolean {
  if (levelNumber === 1) return true;
  return (stats[String(levelNumber - 1)]?.stars ?? 0) > 0;
}

function LevelStars({ stars }: { stars: 0 | 1 | 2 | 3 }) {
  return (
    <span className="text-xs">
      {[1, 2, 3].map((n) => (
        <span key={n} className={n <= stars ? "text-[#facc15]" : "text-[#3e3e52]"}>
          ★
        </span>
      ))}
    </span>
  );
}

const navLinkClassName =
  "text-sm text-[#a0a0c0] hover:text-white transition-colors px-2 py-1 rounded-lg hover:bg-[#2e2e42]";

export default function HomePage() {
  const authState = useAuth((s) => s.state);
  const logout = useAuth((s) => s.logout);
  const [stats, setStats] = useState<PersistedLevelStats>({});

  useEffect(() => {
    setStats(loadLevelStats());
  }, []);

  return (
    <Centered>
      <div className="bg-[#1a1a24] border border-[#2e2e42] rounded-2xl p-6 w-full max-w-[480px] flex flex-col gap-4">
        <div className="flex items-center justify-between flex-wrap gap-y-2">
          <h1 className="text-2xl font-bold tracking-tight whitespace-nowrap">Mental Math</h1>
          <div className="flex items-center gap-1">
            {authState.type === "loggedIn" ? (
              <>
                <span
                  className="text-xs text-[#5a5af0] font-mono max-w-20 truncate"
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
            const unlocked = isUnlocked(n, stats);
            const played = !!levelStats;

            return (
              <button
                key={n}
                disabled={!unlocked}
                className={[
                  "flex flex-col items-center justify-center rounded-xl py-2 px-1 text-sm font-semibold transition-all",
                  unlocked
                    ? played
                      ? "bg-[#0f0f13] border border-[#2e2e42] hover:border-[#5a5af0] cursor-pointer"
                      : "bg-[#1a1a30] border border-[#3a3a55] hover:border-[#5a5af0] cursor-pointer"
                    : "bg-[#0f0f13] border border-[#1e1e28] text-[#3e3e52] cursor-not-allowed",
                ].join(" ")}
              >
                {unlocked ? (
                  <>
                    <span>{n}</span>
                    {played ? (
                      <LevelStars stars={levelStats.stars} />
                    ) : (
                      <span className="text-[10px] text-[#5a5af0] mt-0.5">new</span>
                    )}
                  </>
                ) : (
                  <>
                    <span>{n}</span>
                    <span className="text-[10px] mt-0.5">🔒</span>
                  </>
                )}
              </button>
            );
          })}
        </div>

        {Object.keys(stats).length > 0 && (
          <p className="text-center text-xs text-[#5a5af0]">
            {Object.keys(stats).filter((k) => (stats[k]?.stars ?? 0) > 0).length} / {LEVEL_KEYS.length} levels completed
          </p>
        )}
      </div>
    </Centered>
  );
}
