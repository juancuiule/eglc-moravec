import { ImageResponse } from "next/og";
import { ogFonts } from "@/share/ogFont";
import { OgCard } from "@/share/ogCard";

// Root social card — statically generated at build (see the file-convention
// docs: no request-time APIs → prerendered and cached). Same card as the
// /share/<payload> image minus the result block.
export const alt = "Moravec — Cognición Aritmética";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const { fonts, hasGotham } = await ogFonts;
  return new ImageResponse(
    <OgCard p={null} brand={hasGotham ? "Gotham" : "Overpass Mono"} />,
    {
      ...size,
      fonts,
    },
  );
}
