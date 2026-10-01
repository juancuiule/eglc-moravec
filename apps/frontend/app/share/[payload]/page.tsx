import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { LEVEL_COMPLETE_THRESHOLD, starsForScore } from "engine";
import { formatDuration } from "@/formatTime";
import { decodeSharePayload } from "@/share/payload";
import { StarsDisplay } from "@/components/StarsDisplay";
import { button, panel } from "@/styles";

type Props = { params: Promise<{ payload: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { payload: encoded } = await params;
  const t = await getTranslations("Share");
  const p = decodeSharePayload(encoded);
  if (!p) return {};
  const title = t("ogTitle", { level: p.l, correct: p.k, total: p.n });
  const description = t("ogDescription");
  return {
    title,
    description,
    // The layout's openGraph.{title,description} are explicit — a page's
    // title alone doesn't override them, so the share headline has to be
    // set on og/twitter directly.
    openGraph: { title, description },
    twitter: { title, description },
    // share/[payload]/opengraph-image.tsx supplies the card image for
    // this route automatically.
  };
}

export default async function SharePage({ params }: Props) {
  const { payload: encoded } = await params;
  const t = await getTranslations("Share");
  const tLevels = await getTranslations("Levels");
  const p = decodeSharePayload(encoded);
  if (!p) notFound();

  const levelCompleted = p.k >= LEVEL_COMPLETE_THRESHOLD;

  return (
    <div className={`${panel} p-6 gap-6 text-center`}>
      <p className="text-2xs text-muted-2 uppercase tracking-wider font-medium">
        {t("sharedResult")}
      </p>
      <h1 className="text-4xl font-bold tracking-tight text-foreground">
        {tLevels("level", { number: p.l })}
      </h1>
      <StarsDisplay stars={starsForScore(p.k)} />
      <div>
        <span className="text-muted text-lg">
          {tLevels.rich("score", {
            correct: p.k,
            total: p.n,
            colored: (chunks) => (
              <span
                className={
                  levelCompleted
                    ? "text-teal font-bold text-lg"
                    : "text-danger font-bold text-lg"
                }
              >
                {chunks}
              </span>
            ),
          })}
        </span>
        <p className="font-mono text-accent-text text-xs mt-1">
          {formatDuration(p.ms)}
        </p>
      </div>
      <Link href="/" className={button({ intent: "primary" })}>
        {t("cta")}
      </Link>
    </div>
  );
}
