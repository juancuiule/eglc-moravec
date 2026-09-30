"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { PracticeStopped } from "../practice/index";
import { usePractice } from "../practice/store";
import { focusWeights } from "../practice/focus";
import { allLocalTrials } from "../local/trials";
import { computeStats } from "../stats/computeStats";
import { panel, button } from "../styles";

type Props = { state: PracticeStopped };

export function PracticeSummary({ state }: Props) {
  const t = useTranslations("Practice");
  const tCommon = useTranslations("Common");
  const router = useRouter();
  const start = usePractice((s) => s.start);
  const reset = usePractice((s) => s.reset);

  const { results, config } = state;
  const total = results.length;
  const correctCount = results.filter((r) => r.correct).length;
  const pct = total > 0 ? Math.round((correctCount / total) * 100) : 0;

  function handleBack() {
    reset();
    router.push("/practice");
  }

  return (
    <div className={`${panel} p-6 gap-6`}>
      <h1 className="text-2xl font-bold tracking-tight text-center animate-fade-in">
        {t("sessionDone")}
      </h1>

      <div
        className="text-center animate-fade-in"
        style={{ animationDelay: "150ms", animationFillMode: "backwards" }}
      >
        <span className="text-5xl font-bold font-mono text-accent">{pct}%</span>
        <p className="text-muted text-sm mt-1">
          {t("sessionResult", { correct: correctCount, total })}
        </p>
      </div>

      <div
        className="flex flex-col gap-2 animate-fade-in"
        style={{ animationDelay: "300ms", animationFillMode: "backwards" }}
      >
        <button
          className={button({ intent: "primary" })}
          onClick={() =>
            start(
              // A Focus replay re-derives its weights — the stopped run's
              // Trials are already in the read model (persisted
              // synchronously by the transition watcher), so the replay
              // adapts to the player's current weakness rather than
              // reusing the first session's map. The active run's config
              // stays frozen; only the new run re-weights.
              config.mode === "focus"
                ? {
                    mode: "focus",
                    weights: focusWeights(computeStats(allLocalTrials())),
                  }
                : config,
            )
          }
        >
          {t("practiceAgain")}
        </button>
        <button className={button({ intent: "ghost" })} onClick={handleBack}>
          {tCommon("backToMenu")}
        </button>
      </div>
    </div>
  );
}
