import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { CATEGORY_LABELS } from "@/categoryLabels";
import { formatSeconds } from "@/formatTime";
import { decodeSharePayload } from "@/share/payload";
import { button, panel } from "@/styles";

type Props = { params: Promise<{ payload: string }> };

function label(p: { c: string }): string {
  return CATEGORY_LABELS[p.c] ?? p.c;
}

function accuracy(p: { k: number; n: number }): number {
  return Math.round((p.k / p.n) * 100);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { payload: encoded } = await params;
  const t = await getTranslations("Share");
  const p = decodeSharePayload(encoded);
  if (!p) return {};
  const title = t("ogTitle", {
    pct: accuracy(p),
    category: label(p),
    count: p.n,
  });
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
  const p = decodeSharePayload(encoded);
  if (!p) notFound();

  return (
    <div className={`${panel} p-6 gap-6 text-center`}>
      <p className="text-2xs text-muted-2 uppercase tracking-wider font-medium">
        {t("sharedResult")}
      </p>
      <h1 className="text-4xl font-bold font-mono text-foreground">
        {label(p)}
      </h1>
      <div className="flex flex-col gap-1">
        <span className="text-5xl font-bold font-mono text-accent">
          {accuracy(p)}%
        </span>
        <p className="text-sm text-muted">
          {t("correctOf", { correct: p.k, total: p.n })}
          {p.ms !== null && ` · ${t("avgTime", { t: formatSeconds(p.ms) })}`}
        </p>
      </div>
      <Link href="/" className={button({ intent: "primary" })}>
        {t("cta")}
      </Link>
    </div>
  );
}
