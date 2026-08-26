import Link from "next/link";
import { ALL_CATEGORIES } from "../stats/computeStats";
import { CATEGORY_LABELS } from "../categoryLabels";
import { panel, backLink } from "../styles";

export function PracticeModeSelection() {
  return (
    <div className={`${panel} p-6 gap-4`}>
      <div className="flex items-center gap-3">
        <Link href="/" className={backLink} aria-label="Back to menu">
          ←
        </Link>
        <h1 className="text-xl font-bold tracking-tight">Practice</h1>
      </div>

      <p className="text-sm text-muted">
        Pick a category to practice indefinitely. No pass/fail — just reps.
      </p>

      <div className="grid grid-cols-3 gap-2">
        {ALL_CATEGORIES.map((codename) => (
          <Link
            key={codename}
            href={`/practice/${encodeURIComponent(codename)}`}
            className="flex flex-col items-center justify-center rounded-xl py-3 px-2 bg-base border border-subtle hover:border-accent hover:text-accent transition-all cursor-pointer font-mono text-sm font-semibold"
          >
            {CATEGORY_LABELS[codename] ?? codename}
          </Link>
        ))}
      </div>
    </div>
  );
}
