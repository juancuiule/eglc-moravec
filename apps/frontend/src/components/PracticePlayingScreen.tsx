"use client";

import { canShowHint } from "engine";
import { useTranslations } from "next-intl";
import type { PracticePlaying } from "../practice/index";
import { usePractice } from "../practice/store";
import { CATEGORY_LABELS } from "../categoryLabels";
import { AnsweringPanel } from "./AnsweringPanel";
import { hintButton } from "../styles";

type Props = { state: PracticePlaying };

export function PracticePlayingScreen({ state }: Props) {
  const t = useTranslations("Practice");
  const submitAnswer = usePractice((s) => s.submitAnswer);
  const timeUp = usePractice((s) => s.timeUp);
  const advance = usePractice((s) => s.advance);
  const stop = usePractice((s) => s.stop);
  const requestHint = usePractice((s) => s.requestHint);

  const isReviewing = state.playingState.type === "reviewing";
  const hint = state.currentOperation.hint();
  const hintDisabled =
    !canShowHint(state.hintVisible, hint.hasHint(), state.hintsRemaining) ||
    isReviewing;
  const correctCount = state.results.filter((r) => r.correct).length;
  const totalDone = state.results.length;

  return (
    <AnsweringPanel
      key={state.trialId}
      operation={state.currentOperation}
      playingState={state.playingState}
      hintVisible={state.hintVisible}
      onSubmitAnswer={submitAnswer}
      onTimeUp={timeUp}
      onAdvance={advance}
      beforeOperation={
        <div className="text-center text-xs text-accent-text font-mono tracking-wider">
          {/* The current Trial's own category — equal to the session
              category in category mode, varying per draw in Focus mode. */}
          {CATEGORY_LABELS[state.currentOperation.categoryCodename()] ??
            state.currentOperation.categoryCodename()}
        </div>
      }
      headerLeft={
        <span>
          {t("correctOfTotal", { correct: correctCount, total: totalDone })}
        </span>
      }
      headerRight={
        <div className="flex items-center gap-2">
          {hint.hasHint() && (
            <button
              disabled={hintDisabled}
              onClick={requestHint}
              className={hintButton({
                disabled: hintDisabled,
              })}
            >
              {t("hint")}
            </button>
          )}
          <button
            onClick={stop}
            className="text-muted hover:text-foreground transition-colors text-xs font-medium cursor-pointer touch-manipulation px-2 py-1.5 relative after:absolute after:inset-x-0 after:top-1/2 after:h-11 after:-translate-y-1/2 after:content-['']"
          >
            {t("stop")}
          </button>
        </div>
      }
    />
  );
}
