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
  TUTORIAL_EXAMPLES,
  TUTORIAL_LIVE_NOTE,
  MAJOR_SYSTEM_TABLE,
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

  const hint = operation?.hint();

  return (
    <div className={`${panel} p-6 gap-4`}>
      <div className="flex items-center gap-3">
        <Link href="/tutorials" className={backLink} aria-label="Back to tutorials">
          ←
        </Link>
        <h1 className="text-xl font-bold tracking-tight">{TUTORIAL_TITLES[topic]}</h1>
      </div>

      <p className="text-sm text-muted">{TUTORIAL_EXPLANATIONS[topic]}</p>

      <YouTubeEmbed videoId={videoIdFor(topic)} title={`${TUTORIAL_TITLES[topic]} tutorial`} />

      {topic === "majorSystem" && (
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 bg-base rounded-xl px-4 py-3 font-mono text-sm">
          {MAJOR_SYSTEM_TABLE.map(({ digit, letters }) => (
            <div key={digit} className="flex gap-2">
              <span className="text-accent font-bold w-3">{digit}</span>
              <span className="text-muted">{letters}</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-3">
        {TUTORIAL_EXAMPLES[topic].map((example, i) => (
          <div key={i} className="flex flex-col gap-1">
            <HintCard steps={example.steps} />
            {example.note && <p className="text-xs text-muted-2 px-1">{example.note}</p>}
          </div>
        ))}
      </div>

      {categories.length > 0 && (
        <>
          {TUTORIAL_LIVE_NOTE[topic] && (
            <p className="text-xs text-muted-2">{TUTORIAL_LIVE_NOTE[topic]}</p>
          )}

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

          <div className="flex flex-col gap-3 items-center bg-base rounded-xl px-4 py-6">
            <span data-testid="tutorial-expression" className="font-mono text-2xl font-bold text-foreground">
              {operation!.humanReadable()} = {revealed ? operation!.result() : "?"}
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

          <button onClick={practiceThis} className={`${primaryButton} text-center`}>
            Practice {CATEGORY_LABELS[codename!] ?? codename}
          </button>
        </>
      )}
    </div>
  );
}
