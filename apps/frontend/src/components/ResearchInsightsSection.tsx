"use client";

import { useId, useMemo } from "react";
import { ArrowRight } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import type { SyncedTrial } from "../api/Api";
import { formatSeconds } from "../formatTime";
import {
  computeContribution,
  computeErrorProfile,
  computeRhymeEffect,
  computeTieAdvantage,
  INSIGHT_THRESHOLDS,
  type Arm,
  type ErrorProfile,
  type RhymeEffect,
  type TieAdvantage,
} from "../stats/researchInsights";

const subheading = "text-sm font-medium text-foreground";
const body = "text-sm text-muted";
const fine = "text-2xs text-muted-2";

function TieBar({
  label,
  example,
  arm,
  maxMs,
  fill,
}: {
  label: string;
  example: string;
  arm: Arm;
  maxMs: number;
  fill: string;
}) {
  const pct = arm.avgMs === null ? 0 : (arm.avgMs / maxMs) * 100;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-2 gap-y-1 rounded-lg bg-base px-3 py-2">
      <span className="truncate text-sm">
        {label} <span className="font-mono text-muted-2">{example}</span>
      </span>
      <span className="font-mono text-sm text-muted">
        {arm.avgMs === null ? "—" : formatSeconds(arm.avgMs)}
      </span>
      <div
        aria-hidden="true"
        className="col-span-2 h-1.5 overflow-hidden rounded-full bg-subtle"
      >
        <div
          className={`h-full rounded-full ${fill}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function TieSection({ tie }: { tie: TieAdvantage }) {
  const t = useTranslations("Stats.science");
  const c = tie.comparison;
  const maxMs = Math.max(1, tie.tie.avgMs ?? 0, tie.nonTie.avgMs ?? 0);
  const delta = c.kind === "ready" ? formatSeconds(Math.abs(c.deltaMs)) : "";

  return (
    <div className="flex flex-col gap-2">
      <h3 className={subheading}>{t("tieTitle")}</h3>
      <TieBar
        label={t("tieArm")}
        example="6 × 6"
        arm={tie.tie}
        maxMs={maxMs}
        fill="bg-accent"
      />
      <TieBar
        label={t("nonTieArm")}
        example="5 × 7"
        arm={tie.nonTie}
        maxMs={maxMs}
        fill="bg-muted-2"
      />
      {c.kind === "ready" ? (
        <p className="text-sm font-medium text-foreground">
          {c.direction === "faster"
            ? t("tieFaster", { delta })
            : c.direction === "slower"
              ? t("tieSlower", { delta })
              : t("tieNone")}
        </p>
      ) : (
        <p className={body}>
          {t("tieNeedMore", {
            minTies: INSIGHT_THRESHOLDS.minTieTrials,
            minOthers: INSIGHT_THRESHOLDS.minNonTieTrials,
            ties: tie.tie.count,
            others: tie.nonTie.count,
          })}
        </p>
      )}
      <p className={body}>{t("tieBody")}</p>
      <p className={fine}>
        {t("tieFootnote", { ties: tie.tie.count, others: tie.nonTie.count })}
      </p>
    </div>
  );
}

function ErrorsSection({ profile }: { profile: ErrorProfile }) {
  const t = useTranslations("Stats.science");
  const format = useFormatter();

  return (
    <div className="flex flex-col gap-2">
      <h3 className={subheading}>{t("errorsTitle")}</h3>
      {profile.wrongTotal === 0 ? (
        <p className={body}>{t("errorsClean")}</p>
      ) : (
        <>
          <ol className="flex flex-col gap-1">
            {profile.entries.map((e) => (
              <li
                key={`${e.asked}|${e.given}`}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-lg bg-base px-3 py-2"
              >
                <span className="sr-only">
                  {e.neighborLabel === null
                    ? t("errorEntry", {
                        asked: e.asked,
                        given: e.given,
                        count: e.count,
                      })
                    : t("errorEntryNeighbor", {
                        asked: e.asked,
                        given: e.given,
                        count: e.count,
                        neighbor: e.neighborLabel,
                      })}
                </span>
                <div aria-hidden="true" className="flex min-w-0 flex-col">
                  <span className="flex items-center gap-1.5 font-mono text-sm">
                    {e.asked}
                    <ArrowRight size={14} className="text-muted-2" />
                    <span className="text-danger">{e.given}</span>
                  </span>
                  {e.neighborLabel !== null && (
                    <span className="truncate text-2xs text-accent-text">
                      {t("errorNeighbor", { neighbor: e.neighborLabel })}
                    </span>
                  )}
                </div>
                <span
                  aria-hidden="true"
                  className="font-mono text-xs text-muted"
                >
                  {t("errorCount", { count: e.count })}
                </span>
              </li>
            ))}
          </ol>
          <p className={body}>
            {profile.neighborShare === null
              ? t("errorShareNeedMore", {
                  min: INSIGHT_THRESHOLDS.minWrongMultForShare,
                  count: profile.wrongTotal,
                })
              : t("errorShare", {
                  pct: format.number(profile.neighborShare, {
                    style: "percent",
                  }),
                })}
          </p>
        </>
      )}
    </div>
  );
}

const rhymeGrid =
  "grid grid-cols-[minmax(0,1fr)_4.5rem_4.5rem] items-center gap-2 px-3";

function RhymeCell({ arm }: { arm: Arm }) {
  const t = useTranslations("Stats.science");
  const measured = arm.count >= INSIGHT_THRESHOLDS.minPerRhymeOrder;
  return (
    <span role="cell" className="flex flex-col items-end">
      <span className="font-mono text-sm">
        {measured && arm.avgMs !== null ? formatSeconds(arm.avgMs) : "—"}
      </span>
      <span className={fine}>{t("rhymeCorrect", { count: arm.count })}</span>
    </span>
  );
}

function RhymeSection({ rhyme }: { rhyme: RhymeEffect }) {
  const t = useTranslations("Stats.science");
  return (
    <div className="flex flex-col gap-2">
      <h3 className={subheading}>{t("rhymeTitle")}</h3>
      <p className={body}>{t("rhymeBody")}</p>
      <div
        role="table"
        aria-label={t("rhymeTable")}
        className="flex flex-col gap-1"
      >
        <div
          role="row"
          className={`${rhymeGrid} text-2xs uppercase tracking-wider text-muted-2`}
        >
          <span role="columnheader">{t("rhymeColumnPair")}</span>
          <span role="columnheader" className="text-right">
            {t("rhymeColumnRhyme")}
          </span>
          <span role="columnheader" className="text-right">
            {t("rhymeColumnControl")}
          </span>
        </div>
        {rhyme.pairs.map((p) => (
          <div
            key={p.pair.join("x")}
            role="row"
            className={`${rhymeGrid} rounded-lg bg-base py-2`}
          >
            <span role="cell" className="font-mono text-sm">
              {t.rich("rhymePair", {
                rhyme: `${p.pair[0]} × ${p.pair[1]}`,
                control: `${p.pair[1]} × ${p.pair[0]}`,
                order: (chunks) => (
                  <span className="whitespace-nowrap">{chunks}</span>
                ),
                vs: (chunks) => (
                  <span className="font-sans text-2xs text-muted-2">
                    {chunks}
                  </span>
                ),
              })}
            </span>
            <RhymeCell arm={p.rhyme} />
            <RhymeCell arm={p.control} />
          </div>
        ))}
      </div>
      <p
        className={
          rhyme.verdict.kind === "ready"
            ? "text-sm font-medium text-foreground"
            : body
        }
      >
        {rhyme.verdict.kind === "ready"
          ? t("rhymeVerdict", {
              shown: rhyme.verdict.shownOn,
              ready: rhyme.readyPairs,
            })
          : t("rhymeNeedMore", {
              min: INSIGHT_THRESHOLDS.minPerRhymeOrder,
              pairs: INSIGHT_THRESHOLDS.minReadyRhymePairs,
            })}
      </p>
    </div>
  );
}

/** Every run type feeds this section: it describes the player's share of
 *  the dataset, not Level-vs-Practice performance like the tabs above. */
export function ResearchInsightsSection({
  trials,
}: {
  trials: readonly SyncedTrial[];
}) {
  const t = useTranslations("Stats.science");
  const format = useFormatter();
  const headingId = useId();

  const contribution = useMemo(() => computeContribution(trials), [trials]);
  const tie = useMemo(() => computeTieAdvantage(trials), [trials]);
  const errors = useMemo(() => computeErrorProfile(trials), [trials]);
  const rhyme = useMemo(() => computeRhymeEffect(trials), [trials]);

  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-5 border-t border-subtle pt-4"
    >
      <div className="flex flex-col gap-2">
        <h2
          id={headingId}
          className="text-xs font-medium uppercase tracking-wider text-muted-2"
        >
          {t("title")}
        </h2>
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="whitespace-nowrap font-mono text-2xl font-bold">
            {format.number(contribution.total)}
          </span>
          <span className={body}>
            {t("counterLabel", { count: contribution.total })}
          </span>
        </p>
        <p className={fine}>
          {t("counterSplit", {
            level: contribution.level,
            practice: contribution.practice,
          })}
        </p>
        <p className={body}>{t("intro")}</p>
      </div>

      <TieSection tie={tie} />
      <ErrorsSection profile={errors} />
      <RhymeSection rhyme={rhyme} />

      <p className={fine}>{t("caveat", { count: contribution.total })}</p>
    </section>
  );
}
