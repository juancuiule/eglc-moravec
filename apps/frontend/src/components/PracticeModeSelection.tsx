"use client";

import Link from "next/link";
import { usePractice } from "../practice/store";
import { ALL_CATEGORIES } from "../stats/computeStats";
import { CATEGORY_LABELS } from "../categoryLabels";
import { panel, backLink } from "../styles";

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
