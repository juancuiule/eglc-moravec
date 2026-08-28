import { type LevelStats } from "@/api/Api";
import { formatDuration } from "@/formatTime";
import { isLevelUnlocked } from "@/levels/isLevelUnlocked";
import { backLink, panel } from "@/styles";
import Link from "next/link";

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
  stats: Record<string, LevelStats>;
  levelKeys: number[];
}) {
  const { stats, levelKeys } = props;

  const completedCount = stats
    ? Object.keys(stats).filter((k) => (stats[k]?.stars ?? 0) > 0).length
    : 0;

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

      {levelKeys && stats && (
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
