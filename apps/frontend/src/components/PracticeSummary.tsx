"use client";

import { useRouter } from "next/navigation";
import type { PracticeStopped } from "../practice/index";
import { usePractice } from "../practice/store";
import { panel, button } from "../styles";

type Props = { state: PracticeStopped };

export function PracticeSummary({ state }: Props) {
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
    <div className={`${panel} p-8 gap-6`}>
      <h1 className="text-2xl font-bold tracking-tight text-center">Session done</h1>

      <div className="text-center">
        <span className="text-5xl font-bold text-accent">{pct}%</span>
        <p className="text-muted text-sm mt-1">
          {correctCount} of {total} correct
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <button className={button({ intent: "primary" })} onClick={() => start(config)}>
          Practice again
        </button>
        <button className={button({ intent: "ghost" })} onClick={handleBack}>
          Back to menu
        </button>
      </div>
    </div>
  );
}
