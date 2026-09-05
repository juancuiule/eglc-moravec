"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { createOperation, type Operation } from "engine";
import { CATEGORY_LABELS } from "../categoryLabels";
import {
  TUTORIAL_EXAMPLES,
  MAJOR_SYSTEM_TABLE,
  categoriesForTopic,
  videoIdFor,
  type TutorialTopic,
} from "../tutorials/content";
import { HintCard } from "./HintCard";
import { YouTubeEmbed } from "./YouTubeEmbed";
import { panel, backLink, linkButton } from "../styles";

type Props = { topic: TutorialTopic };

export function TutorialDetail({ topic }: Props) {
  const t = useTranslations("Tutorials");
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

  const hint = operation?.hint();

  // Raw lookups (not t(...)) for the per-topic/per-example notes and the
  // live-example note — both are genuinely optional per topic, and calling
  // t() on a key that isn't present in messages/{locale}/tutorials.json
  // would render the missing-key fallback text instead of nothing.
  const exampleNotes = t.raw("examples") as Record<
    string,
    Record<string, { note?: string }> | undefined
  >;
  const liveNotes = t.raw("liveNote") as Record<string, string | undefined>;
  const liveNote = liveNotes[topic];

  const title = t(`topics.${topic}.title`);

  return (
    <div className={`${panel} p-6 gap-4`}>
      <div className="flex items-center gap-3">
        <Link
          href="/tutorials"
          className={backLink}
          aria-label={t("backToTutorials")}
        >
          ←
        </Link>
        <h1 className="text-xl font-bold tracking-tight">{title}</h1>
      </div>

      <p className="text-sm text-muted">{t(`topics.${topic}.explanation`)}</p>

      <YouTubeEmbed
        videoId={videoIdFor(topic)}
        title={t("videoTitle", { title })}
      />

      {topic === "majorSystem" && (
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 bg-base rounded-xl px-4 py-3 font-mono text-sm">
          {MAJOR_SYSTEM_TABLE.map(({ digit, letters }) => (
            <div key={digit} className="flex gap-2">
              <span className="text-accent-text font-bold w-3">{digit}</span>
              <span className="text-muted">{letters}</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-3">
        {TUTORIAL_EXAMPLES[topic].map((example, i) => {
          const note = exampleNotes[topic]?.[String(i)]?.note;
          return (
            <div key={i} className="flex flex-col gap-1">
              <HintCard steps={example.steps} />
              {note && <p className="text-xs text-muted-2 px-1">{note}</p>}
            </div>
          );
        })}
      </div>

      {categories.length > 0 && (
        <>
          {liveNote && <p className="text-xs text-muted-2">{liveNote}</p>}

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
            <span
              data-testid="tutorial-expression"
              className="font-mono text-2xl font-bold text-foreground"
            >
              {operation!.humanReadable()} ={" "}
              {revealed ? operation!.result() : "?"}
            </span>

            {hint!.hasHint() && (
              <div data-testid="hint-card" className="w-full">
                <HintCard steps={hint!.getSteps()} />
              </div>
            )}

            <div className="flex gap-4 mt-1">
              <button
                onClick={() => setRevealed((r) => !r)}
                className="text-xs text-accent-text hover:underline cursor-pointer touch-manipulation px-1 py-2"
              >
                {revealed ? t("hideAnswer") : t("showAnswer")}
              </button>
              <button
                onClick={() => newExample()}
                className="text-xs text-muted hover:text-foreground cursor-pointer touch-manipulation px-1 py-2"
              >
                {t("newExample")}
              </button>
            </div>
          </div>

          <Link
            href={`/practice/${encodeURIComponent(codename!)}`}
            className={linkButton({ intent: "primary" })}
          >
            {t("practiceCta", {
              category: CATEGORY_LABELS[codename!] ?? codename!,
            })}
          </Link>
        </>
      )}
    </div>
  );
}
