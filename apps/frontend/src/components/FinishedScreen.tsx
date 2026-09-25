"use client";

import { formatDuration } from "@/formatTime";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { Finished } from "../game/index";
import { useGame } from "../game/store";
import { button, linkButton, panel, textLink } from "../styles";
import { StarsDisplay } from "./StarsDisplay";
import { TrialReview } from "./TrialReview";

type Props = {
  state: Finished;
  isNewRecord: boolean;
  // Next Level in the active backend catalog, or null when this run finished
  // the final one — the catalog, not a constant, decides.
  nextLevelNumber: number | null;
};

export function FinishedScreen({ state, isNewRecord, nextLevelNumber }: Props) {
  const t = useTranslations("Levels");
  const tCommon = useTranslations("Common");
  const router = useRouter();
  const reset = useGame((s) => s.reset);
  const start = useGame((s) => s.start);

  const { correctCount, levelCompleted, stars, results, config } = state;
  const totalAttempts = results.length;
  const hasNextLevel = nextLevelNumber !== null;
  const [reviewOpen, setReviewOpen] = useState(false);

  function playNext() {
    if (nextLevelNumber === null) return;
    router.push(`/level/${nextLevelNumber}`);
  }

  function replay() {
    start(config);
  }

  function backToMenu() {
    reset();
    router.push("/levels");
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "n" || e.key === "N") {
        if (levelCompleted && hasNextLevel) playNext();
      } else if (e.key === "r" || e.key === "R") {
        replay();
      } else if (e.key === "m" || e.key === "M") {
        backToMenu();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // playNext/backToMenu close over config/router/reset, and replay comes
    // straight from the store, but `state` (and everything derived from it)
    // never changes for the lifetime of this component's mount — a replay or
    // next-level action navigates away or swaps `gameState` in LevelPlay,
    // unmounting this screen rather than updating it in place. Safe to omit
    // them from the deps below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [levelCompleted, hasNextLevel]);

  const totalTime = results.reduce((sum, r) => sum + r.timeTaken, 0);

  return (
    <div className={["p-6 gap-6", panel].join(" ")}>
      <h1 className="text-2xl font-bold tracking-tight text-center animate-fade-in">
        {levelCompleted ? t("levelComplete") : t("notQuite")}
      </h1>

      {levelCompleted && (
        <div
          className="animate-fade-in"
          style={{ animationDelay: "100ms", animationFillMode: "backwards" }}
        >
          <StarsDisplay stars={stars} />
        </div>
      )}

      {levelCompleted && isNewRecord && (
        <div
          className="flex items-center justify-center gap-1.5 bg-teal-bg text-foreground rounded-xl py-2 px-3 text-sm font-semibold animate-fade-in"
          style={{ animationDelay: "200ms", animationFillMode: "backwards" }}
        >
          <span aria-hidden="true">🎉</span>
          {t("newRecord")}
        </div>
      )}

      <div
        className="text-center animate-fade-in"
        style={{ animationDelay: "300ms", animationFillMode: "backwards" }}
      >
        <span className="text-muted text-lg">
          {t.rich("score", {
            correct: correctCount,
            total: totalAttempts,
            colored: (chunks) => (
              <span
                className={
                  levelCompleted
                    ? "text-teal font-bold text-lg"
                    : "text-danger font-bold text-lg"
                }
              >
                {chunks}
              </span>
            ),
          })}
        </span>
        <p className="font-mono text-accent-text text-xs mt-1">
          {formatDuration(totalTime)}
        </p>
      </div>

      <div
        className="animate-fade-in"
        style={{ animationDelay: "350ms", animationFillMode: "backwards" }}
      >
        <button
          type="button"
          className={`${textLink} text-sm mx-auto block`}
          aria-expanded={reviewOpen}
          onClick={() => setReviewOpen((open) => !open)}
        >
          {reviewOpen
            ? t("hideReview")
            : t("showReview", { count: totalAttempts })}
        </button>
        {reviewOpen && (
          <div className="mt-2">
            <TrialReview results={results} />
          </div>
        )}
      </div>

      <div
        className="flex flex-col gap-2 animate-fade-in"
        style={{ animationDelay: "400ms", animationFillMode: "backwards" }}
      >
        {levelCompleted && hasNextLevel && (
          <Link
            href={`/level/${nextLevelNumber}`}
            className={linkButton({ intent: "success" })}
          >
            {t("playNextLevel")}
          </Link>
        )}
        <button className={button({ intent: "primary" })} onClick={replay}>
          {levelCompleted ? t("replay") : t("tryAgain")}
        </button>
        <button className={button({ intent: "ghost" })} onClick={backToMenu}>
          {tCommon("backToMenu")} (M)
        </button>
      </div>
    </div>
  );
}
