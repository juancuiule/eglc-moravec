"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { Finished } from "../game/index";
import { useGame } from "../game/store";
import { StarsDisplay } from "./StarsDisplay";
import { primaryButton, successButton, ghostButton } from "../styles";

type Props = { state: Finished };

export function FinishedScreen({ state }: Props) {
  const router = useRouter();
  const reset = useGame((s) => s.reset);
  const replay = useGame((s) => s.replay);

  const { correctInTime, levelCompleted, stars, results, config } = state;
  const totalAttempts = results.length;
  const isLastLevel = config.levelNumber >= 150;

  function playNext() {
    router.push(`/level/${config.levelNumber + 1}`);
  }

  function backToMenu() {
    reset();
    router.push("/");
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
    <div
      className={[
        "border rounded-2xl p-8 w-full max-w-120 flex flex-col gap-6",
        levelCompleted ? "bg-teal-bg border-teal" : "bg-danger-bg border-danger-border",
      ].join(" ")}
    >
      <h1 className="text-2xl font-bold tracking-tight text-center">
        {levelCompleted ? "Level Complete!" : "Not quite…"}
      </h1>

      {levelCompleted && <StarsDisplay stars={stars} />}

      <p className="text-center text-lg">
        <span className={levelCompleted ? "text-teal font-bold text-2xl" : "text-danger font-bold text-2xl"}>
          {correctInTime}
        </span>
        <span className="text-muted">
          {" "}
          / {totalAttempts} correct in time
        </span>
      </p>

      <div className="flex flex-col gap-2">
        {levelCompleted && !isLastLevel && (
          <button className={successButton} onClick={playNext}>
            Play next level (N)
          </button>
        )}
        <button className={primaryButton} onClick={replay}>
          {levelCompleted ? "Replay (R)" : "Try again (R)"}
        </button>
        <button className={ghostButton} onClick={backToMenu}>
          Back to menu (M)
        </button>
      </div>
    </div>
  );
}
