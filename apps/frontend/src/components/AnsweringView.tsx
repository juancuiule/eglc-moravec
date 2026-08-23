"use client";

import type { Playing } from "../game/index";
import { useGame } from "../game/store";
import { AnsweringPanel } from "./AnsweringPanel";

type Props = { state: Playing };

export function AnsweringView({ state }: Props) {
  const submitAnswer = useGame((s) => s.submitAnswer);
  const timeUp = useGame((s) => s.timeUp);
  const advance = useGame((s) => s.advance);
  const requestHint = useGame((s) => s.requestHint);

  const isReviewing = state.playingState.type === "reviewing";
  const hintDisabled =
    !state.currentOperation.hint().hasHint() ||
    state.hintVisible ||
    (state.hintsRemaining === 0 && !state.hintVisible) ||
    isReviewing;

  return (
    <AnsweringPanel
      operation={state.currentOperation}
      playingState={state.playingState}
      trialId={state.trialId}
      hintVisible={state.hintVisible}
      onSubmitAnswer={submitAnswer}
      onTimeUp={timeUp}
      onAdvance={advance}
      headerLeft={
        <span>
          Trial {state.trialsConsumed + 1} / {state.config.totalTrials}
        </span>
      }
      headerRight={
        <button
          disabled={hintDisabled}
          onClick={requestHint}
          className={[
            "text-xs font-medium px-2 py-1 rounded-lg transition-all",
            hintDisabled
              ? "text-[#3e3e52] cursor-not-allowed"
              : "text-[#5a5af0] hover:bg-[#2e2e42] cursor-pointer",
          ].join(" ")}
          title="Show hint"
        >
          Hint {state.hintsRemaining}/3
        </button>
      }
    />
  );
}
