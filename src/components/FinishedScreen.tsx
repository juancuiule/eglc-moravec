import { useEffect } from "react";
import type { Finished } from "../game/index";
import { useGame } from "../game/store";
import { LEVELS } from "../LEVELS";
import { TOTAL_TRIALS } from "../game/index";
import { StarsDisplay } from "./StarsDisplay";
import { updateLevelRecord } from "../storage/levelStats";
import { appendTrials, buildPersistedTrials } from "../storage/trialHistory";

type Props = { state: Finished; onBack: () => void };

export function FinishedScreen({ state, onBack }: Props) {
  const reset = useGame((s) => s.reset);
  const replay = useGame((s) => s.replay);
  const load = useGame((s) => s.load);

  const { correctInTime, levelCompleted, stars, results, config } = state;
  const totalAttempts = results.length;
  const isLastLevel = config.levelNumber >= 150;

  // Persist best record and trial history
  useEffect(() => {
    const totalTime = results.reduce((sum, r) => sum + r.timeTaken, 0);
    updateLevelRecord(config.levelNumber, { stars, totalTime });
    appendTrials(buildPersistedTrials(config, results));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function playNext() {
    const nextKey = String(config.levelNumber + 1) as keyof typeof LEVELS;
    const nextLevel = LEVELS[nextKey];
    if (nextLevel) {
      load({
        levelNumber: config.levelNumber + 1,
        level: nextLevel,
        totalTrials: TOTAL_TRIALS,
      });
    }
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "n" || e.key === "N") {
        if (levelCompleted && !isLastLevel) playNext();
      } else if (e.key === "r" || e.key === "R") {
        replay();
      } else if (e.key === "m" || e.key === "M") {
        reset();
        onBack();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [levelCompleted, isLastLevel]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      className={[
        "border rounded-2xl p-8 w-full max-w-120 flex flex-col gap-6",
        levelCompleted
          ? "bg-[#0d2b1a] border-[#166534]"
          : "bg-[#2b0d0d] border-[#7f1d1d]",
      ].join(" ")}
    >
      <h1 className="text-2xl font-bold tracking-tight text-center">
        {levelCompleted ? "Level Complete!" : "Not quite…"}
      </h1>

      {levelCompleted && <StarsDisplay stars={stars} />}

      <p className="text-center text-lg">
        <span
          className={
            levelCompleted
              ? "text-[#4ade80] font-bold text-2xl"
              : "text-[#f87171] font-bold text-2xl"
          }
        >
          {correctInTime}
        </span>
        <span className="text-[#a0a0c0]">
          {" "}
          / {totalAttempts} correct in time
        </span>
      </p>

      <div className="flex flex-col gap-2">
        {levelCompleted && !isLastLevel && (
          <button
            className="cursor-pointer bg-[#166534] text-white w-full rounded-lg px-5 py-2.5 font-semibold hover:opacity-90 active:scale-[0.97] transition-opacity"
            onClick={playNext}
          >
            Play next level (N)
          </button>
        )}
        <button
          className="cursor-pointer bg-[#5a5af0] text-white w-full rounded-lg px-5 py-2.5 font-semibold hover:opacity-90 active:scale-[0.97] transition-opacity"
          onClick={replay}
        >
          {levelCompleted ? "Replay (R)" : "Try again (R)"}
        </button>
        <button
          className="cursor-pointer text-[#a0a0c0] w-full rounded-lg px-5 py-2 font-medium hover:text-white transition-colors"
          onClick={() => {
            reset();
            onBack();
          }}
        >
          Back to menu (M)
        </button>
      </div>
    </div>
  );
}
