"use client";

import { useRouter } from "next/navigation";
import type { PracticeStopped } from "../practice/index";
import { usePractice } from "../practice/store";

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
    router.push("/");
  }

  return (
    <div className="bg-[#1a1a24] border border-[#2e2e42] rounded-2xl p-8 w-full max-w-[420px] flex flex-col gap-6">
      <h1 className="text-2xl font-bold tracking-tight text-center">Session done</h1>

      <div className="text-center">
        <span className="text-5xl font-bold text-[#5a5af0]">{pct}%</span>
        <p className="text-[#a0a0c0] text-sm mt-1">
          {correctInTime} of {total} correct in time
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <button
          className="cursor-pointer bg-[#5a5af0] text-white w-full rounded-lg px-5 py-2.5 font-semibold hover:opacity-90 active:scale-[0.97] transition-opacity"
          onClick={() => start(config)}
        >
          Practice again
        </button>
        <button
          className="cursor-pointer text-[#a0a0c0] w-full rounded-lg px-5 py-2 font-medium hover:text-white transition-colors"
          onClick={handleBack}
        >
          Back to menu
        </button>
      </div>
    </div>
  );
}
