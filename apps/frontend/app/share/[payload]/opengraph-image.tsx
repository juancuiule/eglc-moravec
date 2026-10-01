import { ImageResponse } from "next/og";
import { ogFonts } from "@/share/ogFont";
import { CATEGORY_LABELS } from "@/categoryLabels";
import { formatSeconds } from "@/formatTime";
import { decodeSharePayload } from "@/share/payload";

// Per-share card: the URL's base64url payload carries the player's shared
// result, so each link unfurls with its own numbers. Dynamic by definition
// (params are request-time) — crawlers hit this, not players.
export const alt = "EGLC Moravec — shared result";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({
  params,
}: {
  params: Promise<{ payload: string }>;
}) {
  const { payload } = await params;
  const p = decodeSharePayload(payload);

  const title = p ? (CATEGORY_LABELS[p.c] ?? p.c) : "EGLC Moravec";
  const pct = p ? Math.round((p.k / p.n) * 100) : null;
  const detail = p
    ? `${p.k} of ${p.n} correct` +
      (p.ms !== null ? ` · avg ${formatSeconds(p.ms)}` : "")
    : "Mental-math training";

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        background: "#f0eff4",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: 80,
        position: "relative",
      }}
    >
      {/* moravec.svg glyph, bleeding off the lower-right corner */}
      <div
        style={{
          position: "absolute",
          right: -60,
          bottom: -40,
          width: 330,
          height: 330,
          border: "56px solid #0da08e",
        }}
      />
      <div
        style={{
          position: "absolute",
          right: 180,
          bottom: 110,
          width: 240,
          height: 240,
          borderRadius: 240,
          border: "40px solid #dc1c61",
        }}
      />
      <div
        style={{
          display: "flex",
          fontSize: 32,
          color: "#585e69",
          textTransform: "uppercase",
          letterSpacing: 4,
        }}
      >
        EGLC Moravec
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 32,
          marginTop: 24,
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 150,
            fontWeight: 700,
            color: "#ef2172",
          }}
        >
          {pct !== null ? `${pct}%` : ""}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 64,
            fontWeight: 700,
            color: "#262b3d",
          }}
        >
          {title}
        </div>
      </div>
      <div
        style={{
          display: "flex",
          fontSize: 38,
          color: "#585e69",
          marginTop: 24,
        }}
      >
        {detail}
      </div>
    </div>,
    {
      ...size,
      fonts: await ogFonts,
    },
  );
}
