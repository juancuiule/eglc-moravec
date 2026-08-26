"use client";

import { useMemo } from "react";
import { computeHistogram, type StatsTrial } from "../stats/computeStats";
import { panel, backLink } from "../styles";

type Props = {
  codename: string;
  trials: StatsTrial[];
  onBack: () => void;
};

export function CategoryStatsDetail({ codename, trials, onBack }: Props) {
  const buckets = useMemo(() => computeHistogram(trials, codename), [trials, codename]);
  const maxCount = Math.max(1, ...buckets.map((b) => b.count));
  const categoryTrials = trials.filter((t) => t.categoryCodename === codename);
  const correctCount = categoryTrials.filter((t) => t.correct).length;

  return (
    <div className={`${panel} p-6 gap-4`}>
      <div className="flex items-center gap-3">
        <button onClick={onBack} className={backLink} aria-label="Back to statistics">
          ←
        </button>
        <h1 className="text-xl font-bold tracking-tight font-mono">{codename}</h1>
      </div>

      <p className="text-sm text-muted">
        {correctCount} correct · {categoryTrials.length} total trials
      </p>

      {buckets.length === 0 ? (
        <p className="text-center text-muted-2 py-8">No correct trials yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-2 uppercase tracking-wider font-medium">
            Response time distribution
          </p>
          {buckets.map((bucket) => (
            <div key={bucket.label} className="flex items-center gap-3">
              <span className="text-xs text-muted-2 w-12 text-right font-mono shrink-0">
                {bucket.label}
              </span>
              <div className="flex-1 h-5 bg-base rounded overflow-hidden">
                <div
                  className="h-full bg-accent rounded transition-all"
                  style={{ width: `${(bucket.count / maxCount) * 100}%` }}
                />
              </div>
              <span className="text-xs text-muted w-6 text-right shrink-0">
                {bucket.count}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
