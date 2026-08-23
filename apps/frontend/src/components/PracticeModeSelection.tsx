"use client";

import Link from "next/link";
import { usePractice } from "../practice/store";
import { ALL_CATEGORIES } from "../stats/computeStats";
import { panel, backLink } from "../styles";

// Human-readable labels for each category codename
const CATEGORY_LABELS: Record<string, string> = {
  "1d+1d":   "1d + 1d",
  "2d+2d":   "2d + 2d",
  "1dx1d":   "1d × 1d",
  "2dx1d":   "2d × 1d",
  "3dx1d":   "3d × 1d",
  "4dx1d":   "4d × 1d",
  "(2d)^2":  "2d²",
  "(3d)^2":  "3d²",
  "(4d)^2":  "4d²",
};

export function PracticeModeSelection() {
  const start = usePractice((s) => s.start);

  return (
    <div className={`${panel} p-6 max-w-[480px] gap-4`}>
      <div className="flex items-center gap-3">
        <Link href="/" className={backLink}>
          ←
        </Link>
        <h1 className="text-xl font-bold tracking-tight">Practice</h1>
      </div>

      <p className="text-sm text-muted">
        Pick a category to practice indefinitely. No pass/fail — just reps.
      </p>

      <div className="grid grid-cols-3 gap-2">
        {ALL_CATEGORIES.map((codename) => (
          <button
            key={codename}
            onClick={() => start({ categoryCodename: codename })}
            className="flex flex-col items-center justify-center rounded-xl py-3 px-2 bg-base border border-subtle hover:border-accent hover:text-accent transition-all cursor-pointer font-mono text-sm font-semibold"
          >
            {CATEGORY_LABELS[codename] ?? codename}
          </button>
        ))}
      </div>
    </div>
  );
}
