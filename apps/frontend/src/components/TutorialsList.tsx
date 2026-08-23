import Link from "next/link";
import { TUTORIAL_TOPICS, TUTORIAL_TITLES } from "../tutorials/content";
import { panel, backLink } from "../styles";

export function TutorialsList() {
  return (
    <div className={`${panel} p-6 max-w-[420px] gap-4`}>
      <div className="flex items-center gap-3">
        <Link href="/" className={backLink} aria-label="Back to menu">
          ←
        </Link>
        <h1 className="text-xl font-bold tracking-tight">Tutorials</h1>
      </div>

      <p className="text-sm text-muted">How each operation works, with a live worked example.</p>

      <div className="flex flex-col gap-2">
        {TUTORIAL_TOPICS.map((topic) => (
          <Link
            key={topic}
            href={`/tutorial/${topic}`}
            className="flex items-center justify-between rounded-xl px-4 py-3 bg-base border border-subtle hover:border-accent hover:text-accent transition-all"
          >
            <span className="font-semibold">{TUTORIAL_TITLES[topic]}</span>
            <span aria-hidden="true">→</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
