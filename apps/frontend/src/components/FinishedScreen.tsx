"use client";

import { formatDuration } from "@/formatTime";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { TOTAL_LEVELS } from "engine";
import type { Finished } from "../game/index";
import { useGame } from "../game/store";
import { button, panel } from "../styles";
import { StarsDisplay } from "./StarsDisplay";

type Props = { state: Finished };

export function FinishedScreen({ state }: Props) {
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
  }, [levelCompleted, isLastLevel]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={["p-6 gap-6", panel].join(" ")}>
      <h1 className="text-2xl font-bold tracking-tight text-center">
        {levelCompleted ? "Level Complete!" : "Not quite…"}
      </h1>

      {levelCompleted && <StarsDisplay stars={stars} />}

      <p className="font-mono text-accent text-xs text-center">
        {formatDuration(
          state.results.reduce((acc, curr) => acc + curr.timeTaken, 0),
        )}
      </p>

      <p className="text-center text-lg">
        <span
          className={
            levelCompleted
              ? "text-teal font-bold text-2xl"
              : "text-danger font-bold text-2xl"
          }
        >
          {correctCount}
        </span>
        <span className="text-muted"> / {totalAttempts} correct</span>
      </p>

      <div className="flex flex-col gap-2">
        {levelCompleted && !isLastLevel && (
          <button className={button({ intent: "success" })} onClick={playNext}>
            Play next level (N)
          </button>
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
