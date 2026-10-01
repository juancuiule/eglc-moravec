import { ImageResponse } from "next/og";
import { getTranslations } from "next-intl/server";
import { ogFonts } from "@/share/ogFont";
import { OgCard } from "@/share/ogCard";
import { decodeSharePayload } from "@/share/payload";

// Per-share card: the URL's base64url payload carries the player's level
// result, so each link unfurls with its own numbers. Dynamic by definition
// (params are request-time) — crawlers hit this, not players.
export const alt = "Moravec - Cognición Aritmética — shared level result";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({
  params,
}: {
  params: Promise<{ payload: string }>;
}) {
  const { payload } = await params;
  const t = await getTranslations("Levels");
  const tShare = await getTranslations("Share");
  const p = decodeSharePayload(payload);
  const { fonts, hasGotham } = await ogFonts;

  return new ImageResponse(
    <OgCard
      p={p}
      brand={hasGotham ? "Gotham" : "Overpass Mono"}
      levelText={p ? t("level", { number: p.l }) : undefined}
      scoreText={p ? tShare("score", { correct: p.k, total: p.n }) : undefined}
    />,
    {
      ...size,
      fonts,
    },
  );
}
