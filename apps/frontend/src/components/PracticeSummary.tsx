"use client";

import { useRouter } from "next/navigation";
import type { PracticeStopped } from "../practice/index";
import { usePractice } from "../practice/store";
import { panel, primaryButton, ghostButton } from "../styles";

type Props = { state: PracticeStopped };

export function PracticeSummary({ state }: Props) {
  const router = useRouter();
  const start = usePractice((s) => s.start);
  const reset = usePractice((s) => s.reset);

  const { results, config } = state;
  const total = results.length;
  const correctInTime = results.filter((r) => r.correct && !r.timeExceeded).length;
  const pct = total > 0 ? Math.round((correctInTime / total) * 100) : 0;

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
          {correctInTime} of {total} correct in time
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <button className={primaryButton} onClick={() => start(config)}>
          Practice again
        </button>
        <button className={ghostButton} onClick={handleBack}>
          Back to menu
        </button>
      </div>
    </div>
  );
}
