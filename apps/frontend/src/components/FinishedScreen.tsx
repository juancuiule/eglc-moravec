"use client";

import { formatDuration } from "@/formatTime";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { TOTAL_LEVELS } from "engine";
import type { Finished } from "../game/index";
import { useGame } from "../game/store";
import { button, linkButton, panel } from "../styles";
import { StarsDisplay } from "./StarsDisplay";

type Props = { state: Finished; isNewRecord: boolean };

export function FinishedScreen({ state, isNewRecord }: Props) {
  const router = useRouter();
  const reset = useGame((s) => s.reset);
  const replay = useGame((s) => s.replay);

  const { correctCount, levelCompleted, stars, results, config } = state;
  const totalAttempts = results.length;
  const isLastLevel = config.levelNumber >= TOTAL_LEVELS;

  function playNext() {
    router.push(`/level/${config.levelNumber + 1}`);
  }

  function backToMenu() {
    reset();
    router.push("/levels");
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "n" || e.key === "N") {
        if (levelCompleted && !isLastLevel) playNext();
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
  }, [levelCompleted, isLastLevel]);

  const totalTime = results.reduce((sum, r) => sum + r.timeTaken, 0);

  return (
    <div className={["p-6 gap-6", panel].join(" ")}>
      <h1 className="text-2xl font-bold tracking-tight text-center animate-fade-in">
        {levelCompleted ? "Level Complete!" : "Not quite…"}
      </h1>

      {levelCompleted && (
        <div className="animate-fade-in" style={{ animationDelay: "100ms", animationFillMode: "backwards" }}>
          <StarsDisplay stars={stars} />
        </div>
      )}

      {levelCompleted && isNewRecord && (
        <div
          className="flex items-center justify-center gap-1.5 bg-teal-bg text-foreground rounded-xl py-2 px-3 text-sm font-semibold animate-fade-in"
          style={{ animationDelay: "200ms", animationFillMode: "backwards" }}
        >
          <span aria-hidden="true">🎉</span>
          New record!
        </div>
      )}

      <div className="text-center animate-fade-in" style={{ animationDelay: "300ms", animationFillMode: "backwards" }}>
        <span
          className={
            levelCompleted
              ? "text-teal font-bold text-2xl"
              : "text-danger font-bold text-2xl"
          }
        >
          {correctCount}
        </span>
        <span className="text-muted text-lg"> / {totalAttempts} correct</span>
        <p className="font-mono text-accent-text text-xs mt-1">
          {formatDuration(totalTime)}
        </p>
      </div>

      <div
        className="flex flex-col gap-2 animate-fade-in"
        style={{ animationDelay: "400ms", animationFillMode: "backwards" }}
      >
        {levelCompleted && !isLastLevel && (
          <Link href={`/level/${config.levelNumber + 1}`} className={linkButton({ intent: "success" })}>
            Play next level (N)
          </Link>
        )}
        <button className={button({ intent: "primary" })} onClick={replay}>
          {levelCompleted ? "Replay (R)" : "Try again (R)"}
        </button>
        <button className={button({ intent: "ghost" })} onClick={backToMenu}>
          Back to menu (M)
        </button>
      </div>
    </div>
  );
}
