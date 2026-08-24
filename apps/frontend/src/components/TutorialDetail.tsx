"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createOperation, type Operation } from "engine";
import { usePractice } from "../practice/store";
import { CATEGORY_LABELS } from "../categoryLabels";
import {
  TUTORIAL_TITLES,
  TUTORIAL_EXPLANATIONS,
  categoriesForTopic,
  videoIdFor,
  type TutorialTopic,
} from "../tutorials/content";
import { HintCard } from "./HintCard";
import { YouTubeEmbed } from "./YouTubeEmbed";
import { panel, backLink, primaryButton } from "../styles";

type Props = { topic: TutorialTopic };

export function TutorialDetail({ topic }: Props) {
  const router = useRouter();
  const start = usePractice((s) => s.start);
  const categories = useMemo(() => categoriesForTopic(topic), [topic]);
  // The most complex category in the topic actually has digits to decompose —
  // "1d × 1d" has nothing to break down and makes for a trivial-looking hint.
  const defaultCategory: string | undefined = categories[categories.length - 1];

  const [codename, setCodename] = useState(defaultCategory);
  const [operation, setOperation] = useState<Operation | null>(() =>
    defaultCategory ? createOperation(defaultCategory) : null,
  );
  const [revealed, setRevealed] = useState(false);

  function newExample(nextCodename: string = codename!) {
    setCodename(nextCodename);
    setOperation(createOperation(nextCodename));
    setRevealed(false);
  }

  function practiceThis() {
    if (!codename) return;
    start({ categoryCodename: codename });
    router.push("/practice");
  }

  const videoId = videoIdFor(topic, codename);
  const hint = operation?.hint();

  return (
    <div className={`${panel} p-6 max-w-[480px] gap-4`}>
      <div className="flex items-center gap-3">
        <Link href="/tutorials" className={backLink} aria-label="Back to tutorials">
          ←
        </Link>
        <h1 className="text-xl font-bold tracking-tight">{TUTORIAL_TITLES[topic]}</h1>
      </div>

      <p className="text-sm text-muted">{TUTORIAL_EXPLANATIONS[topic]}</p>

      {videoId && <YouTubeEmbed videoId={videoId} title={`${TUTORIAL_TITLES[topic]} tutorial`} />}

      {categories.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => newExample(c)}
              aria-pressed={c === codename}
              className={[
                "font-mono text-xs px-2.5 py-1 rounded-lg border transition-colors cursor-pointer",
                c === codename
                  ? "bg-accent text-white border-accent"
                  : "bg-base border-subtle text-muted hover:text-foreground",
              ].join(" ")}
            >
              {CATEGORY_LABELS[c] ?? c}
            </button>
          ))}
        </div>
      )}

      {operation && (
        <div className="flex flex-col gap-3 items-center bg-base rounded-xl px-4 py-6">
          <span data-testid="tutorial-expression" className="font-mono text-2xl font-bold text-foreground">
            {operation.humanReadable()} = {revealed ? operation.result() : "?"}
          </span>

          {hint!.hasHint() && (
            <div data-testid="hint-card" className="w-full">
              <HintCard steps={hint!.getSteps()} />
            </div>
          )}

          <div className="flex gap-4 mt-1">
            <button
              onClick={() => setRevealed((r) => !r)}
              className="text-xs text-accent hover:underline cursor-pointer"
            >
              {revealed ? "Hide answer" : "Show answer"}
            </button>
            <button onClick={() => newExample()} className="text-xs text-muted hover:text-foreground cursor-pointer">
              New example
            </button>
          </div>
        </div>
      )}

      {codename && (
        <button onClick={practiceThis} className={`${primaryButton} text-center`}>
          Practice {CATEGORY_LABELS[codename] ?? codename}
        </button>
      )}
    </div>
  );
}
