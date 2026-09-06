"use client";

import { canShowHint } from "engine";
import { useTranslations } from "next-intl";
import type { Playing } from "../game/index";
import { useGame } from "../game/store";
import { hintButton } from "../styles";
import { AnsweringPanel } from "./AnsweringPanel";

type Props = { state: Playing };

export function AnsweringView({ state }: Props) {
  const t = useTranslations("Levels");
  const submitAnswer = useGame((s) => s.submitAnswer);
  const timeUp = useGame((s) => s.timeUp);
  const advance = useGame((s) => s.advance);
  const requestHint = useGame((s) => s.requestHint);

  const isReviewing = state.playingState.type === "reviewing";
  const hintDisabled =
    !canShowHint(
      state.hintVisible,
      state.currentOperation.hint().hasHint(),
      state.hintsRemaining,
    ) || isReviewing;

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
        <h1 className="text-center text-xs text-muted font-mono tracking-wider">
          {t("level", { number: state.config.levelNumber })}
        </h1>
      }
      headerLeft={
        <span>
          {t("trial", {
            current: state.results.length + 1,
            total: state.config.totalTrials,
          })}
        </span>
      }
      headerRight={
        <button
          disabled={hintDisabled}
          onClick={requestHint}
          className={hintButton({ disabled: hintDisabled })}
          title={t("hintTooltip")}
        >
          {t("hint", { remaining: state.hintsRemaining })}
        </button>
      }
    />
  );
}
