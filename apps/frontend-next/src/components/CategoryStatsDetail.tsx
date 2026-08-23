"use client";

import { useMemo } from "react";
import { computeHistogram, type StatsTrial } from "../stats/computeStats";

type Props = {
  codename: string;
  trials: StatsTrial[];
  onBack: () => void;
};

export function CategoryStatsDetail({ codename, trials, onBack }: Props) {
  const buckets = useMemo(() => computeHistogram(trials, codename), [trials, codename]);
  const maxCount = Math.max(1, ...buckets.map((b) => b.count));
  const categoryTrials = trials.filter((t) => t.categoryCodename === codename);
  const correctInTime = categoryTrials.filter((t) => t.correct && !t.timeExceeded).length;

  return (
    <div className="bg-[#1a1a24] border border-[#2e2e42] rounded-2xl p-6 w-full max-w-[480px] flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="text-[#a0a0c0] hover:text-white transition-colors text-lg leading-none"
        >
          ←
        </button>
        <h1 className="text-xl font-bold tracking-tight font-mono">{codename}</h1>
      </div>

      <p className="text-sm text-[#a0a0c0]">
        {correctInTime} correct in time · {categoryTrials.length} total trials
      </p>

      {buckets.length === 0 ? (
        <p className="text-center text-[#5a5a80] py-8">No correct-in-time trials yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-[#5a5a80] uppercase tracking-wider font-medium">
            Response time distribution
          </p>
          {buckets.map((bucket) => (
            <div key={bucket.label} className="flex items-center gap-3">
              <span className="text-xs text-[#5a5a80] w-12 text-right font-mono shrink-0">
                {bucket.label}
              </span>
              <div className="flex-1 h-5 bg-[#0f0f13] rounded overflow-hidden">
                <div
                  className="h-full bg-[#5a5af0] rounded transition-all"
                  style={{ width: `${(bucket.count / maxCount) * 100}%` }}
                />
              </div>
              <span className="text-xs text-[#a0a0c0] w-6 text-right shrink-0">
                {bucket.count}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
