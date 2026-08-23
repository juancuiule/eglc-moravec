"use client";

import Link from "next/link";
import { usePractice } from "../practice/store";
import { ALL_CATEGORIES } from "../stats/computeStats";

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
    <div className="bg-[#1a1a24] border border-[#2e2e42] rounded-2xl p-6 w-full max-w-[480px] flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Link href="/" className="text-[#a0a0c0] hover:text-white transition-colors text-lg leading-none">
          ←
        </Link>
        <h1 className="text-xl font-bold tracking-tight">Practice</h1>
      </div>

      <p className="text-sm text-[#a0a0c0]">
        Pick a category to practice indefinitely. No pass/fail — just reps.
      </p>

      <div className="grid grid-cols-3 gap-2">
        {ALL_CATEGORIES.map((codename) => (
          <button
            key={codename}
            onClick={() => start({ categoryCodename: codename })}
            className="flex flex-col items-center justify-center rounded-xl py-3 px-2 bg-[#0f0f13] border border-[#2e2e42] hover:border-[#5a5af0] hover:text-[#5a5af0] transition-all cursor-pointer font-mono text-sm font-semibold"
          >
            {CATEGORY_LABELS[codename] ?? codename}
          </button>
        ))}
      </div>
    </div>
  );
}
