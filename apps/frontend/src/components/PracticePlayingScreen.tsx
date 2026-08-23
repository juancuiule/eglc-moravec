"use client";

import type { PracticePlaying } from "../practice/index";
import { usePractice } from "../practice/store";
import { AnsweringPanel } from "./AnsweringPanel";

type Props = { state: PracticePlaying };

export function PracticePlayingScreen({ state }: Props) {
  const submitAnswer = usePractice((s) => s.submitAnswer);
  const timeUp = usePractice((s) => s.timeUp);
  const advance = usePractice((s) => s.advance);
  const stop = usePractice((s) => s.stop);
  const requestHint = usePractice((s) => s.requestHint);

  const isReviewing = state.playingState.type === "reviewing";
  const hint = state.currentOperation.hint();
  const correctInTime = state.results.filter((r) => r.correct && !r.timeExceeded).length;
  const totalDone = state.results.length;

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
        <div className="text-center text-xs text-accent font-mono tracking-wider">
          {state.config.categoryCodename}
        </div>
      }
      extraFeedback={(result) =>
        result.timeExceeded && result.correct ? (
          <span className="text-sm opacity-70">Too slow — keep going!</span>
        ) : null
      }
      headerLeft={
        <span>
          {correctInTime} / {totalDone} correct
        </span>
      }
      headerRight={
        <div className="flex items-center gap-2">
          {hint.hasHint() && (
            <button
              disabled={state.hintVisible || isReviewing}
              onClick={requestHint}
              className={[
                "text-xs font-medium px-2 py-1 rounded-lg transition-all",
                state.hintVisible || isReviewing
                  ? "text-disabled cursor-not-allowed"
                  : "text-accent hover:bg-subtle cursor-pointer",
              ].join(" ")}
            >
              Hint
            </button>
          )}
          <button
            onClick={stop}
            className="text-danger hover:text-white transition-colors text-xs font-medium cursor-pointer"
          >
            Stop
          </button>
        </div>
      }
    />
  );
}
