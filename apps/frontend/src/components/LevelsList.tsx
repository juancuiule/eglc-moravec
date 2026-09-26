"use client";

import { formatDuration } from "@/formatTime";
import type { LevelStats } from "@/api/Api";
import { isLevelUnlocked } from "@/levels/isLevelUnlocked";
import { useLocalLevelStats, useSessionSeedStats } from "@/local/hooks";
import { mergeLevelStats } from "@/local/trials";
import { backLink, panel } from "@/styles";
import Link from "next/link";
import { useTranslations } from "next-intl";

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
          <span key={n} className={light ? "text-white" : "text-accent-text"}>
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

export function LevelsList(props: {
  levelKeys: number[];
  stats?: Record<string, LevelStats>;
}) {
  const { levelKeys } = props;
  // Records (and therefore unlock state) come from the local-first store —
  // correct offline and immediately after a run, even before a push lands.
  // The server seed only fills first paint and the failed-pull case; local
  // rows win wherever they exist, and the seed dies with its session.
  const seedStats = useSessionSeedStats(props.stats ?? {});
  const localStats = useLocalLevelStats();
  const stats =
    localStats === undefined
      ? Object.keys(seedStats).length > 0
        ? seedStats
        : undefined
      : mergeLevelStats(seedStats, localStats);
  const t = useTranslations("Levels");
  const tCommon = useTranslations("Common");

  const completedCount = stats
    ? Object.keys(stats).filter((k) => (stats[k]?.stars ?? 0) > 0).length
    : 0;

  return (
    <div className={`${panel} p-6 gap-3`}>
      <div className="flex items-center gap-3">
        <Link href="/" className={backLink} aria-label={tCommon("backToMenu")}>
          ←
        </Link>
        <h1 className="text-xl font-bold tracking-tight">{t("heading")}</h1>
      </div>

      {stats === undefined ? (
        <p className="py-8 text-center text-sm text-muted">{t("loading")}</p>
      ) : completedCount > 0 ? (
        <p className="text-center text-xs text-muted">
          {t("completedCount", {
            completed: completedCount,
            total: levelKeys.length,
          })}
        </p>
      ) : null}

      {stats !== undefined && (
        <div className="flex flex-col -mx-6 max-h-[60dvh] overflow-y-auto overflow-x-hidden">
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
                  <span className="font-semibold">
                    {t("level", { number: n })}
                  </span>
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
                    <span className="font-bold">
                      {t("level", { number: n })}
                    </span>
                    <RowStars stars={0} light />
                  </div>
                  <span className="text-sm font-semibold tracking-wide">
                    {t("play")}
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
                  {t("level", { number: n })}
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
