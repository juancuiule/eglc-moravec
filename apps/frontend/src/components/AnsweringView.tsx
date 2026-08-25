"use client";

import type { Playing } from "../game/index";
import { useGame } from "../game/store";
import { AnsweringPanel } from "./AnsweringPanel";
import { hintButton } from "../styles";

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
      beforeOperation={
        <div className="text-center text-xs text-muted font-mono tracking-wider">
          Level {state.config.levelNumber}
        </div>
      }
      headerLeft={
        <span>
          Trial {state.results.length + 1} / {state.config.totalTrials}
        </span>
      }
      headerRight={
        <button
          disabled={hintDisabled}
          onClick={requestHint}
          className={hintButton({ disabled: hintDisabled })}
          title="Show hint"
        >
          Hint {state.hintsRemaining}/3
        </button>
      }
    />
  );
}
