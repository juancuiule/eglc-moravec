import type { ReactElement } from "react";
import { starsForScore } from "engine";
import { formatDuration } from "@/formatTime";
import type { SharePayload } from "./payload";

// The brand card behind both OG routes — Frame 485's composition: Gotham
// "Moravec" + "____Cognición Aritmética", the square/circle glyph bleeding
// off the right edge (mix-blend-mode: multiply paints the navy chord for
// free), pink mono URL bottom-left. With a SharePayload it adds the level
// result block between subtitle and URL; with p=null it's the general card.
//
// Absent or incomplete Gotham files make `brand` fall back to Overpass Mono,
// so the card still renders.

// lucide-react's `Star` geometry (24×24 viewBox, 2px round stroke), inlined
// because Satori can't reliably render the React component. Keep in sync
// with the in-app icon in components/StarsDisplay.tsx.
const STAR_PATH =
  "M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z";

export function OgCard({
  p,
  brand,
  levelText,
  scoreText,
}: {
  p: SharePayload | null;
  brand: "Gotham" | "Overpass Mono";
  levelText?: string;
  scoreText?: string;
}): ReactElement {
  const stars = p ? starsForScore(p.k) : 0;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: "#eeeef0",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 64,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <svg
        width="813"
        height="502"
        viewBox="0 0 813 502"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{
          position: "absolute",
          left: 516,
          top: 64,
          zIndex: 0,
          opacity: 1,
        }}
      >
        <rect
          x="35.8571"
          y="40.9333"
          width="420.131"
          height="420.131"
          stroke="#0DA08E"
          strokeWidth="71.7143"
        />
        <circle
          cx="561.344"
          cy="251"
          r="215.46"
          stroke="#DC1C61"
          strokeWidth="71.0796"
          style={{
            mixBlendMode: "multiply",
          }}
        />
      </svg>

      <div
        style={{
          display: "flex",
          flex: "1",
          flexDirection: "column",
          justifyContent: "space-between",
          gap: 0,
          zIndex: 1,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 0,
            fontFamily: brand,
            color: "#121212",
            letterSpacing: "-2%",
            lineHeight: "1.2",
          }}
        >
          <div
            style={{
              fontWeight: 900,
              fontSize: "160px",
            }}
          >
            Moravec
          </div>
          <div
            style={{
              fontWeight: 500,
              fontSize: "24px",
              marginTop: -12,
            }}
          >
            _________Cognición Aritmética
          </div>
        </div>

        {p && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              width: "fit-content",
              gap: "8px",
            }}
          >
            <div
              style={{
                fontFamily: brand,
                fontWeight: 700,
                fontSize: "24px",
                color: "#121212",
                letterSpacing: "-2%",
                lineHeight: "29px",
              }}
            >
              {levelText}
            </div>

            <div
              style={{ display: "flex", gap: 6, transform: "translateX(-8px)" }}
            >
              {[1, 2, 3].map((n) => {
                // Unearned grey is #585e6932 pre-composited onto the #eeeef0
                // card: opaque, so the stroke overlapping the fill doesn't
                // double the alpha into a darker rim.
                const color = n <= stars ? "#eab308" : "#d1d2d6";
                return (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    key={n}
                    width={48}
                    height={48}
                  >
                    <path
                      d={STAR_PATH}
                      fill={color}
                      stroke={color}
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                );
              })}
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 0,
                fontFamily: "Overpass Mono",
                fontWeight: 400,
                fontSize: 18,
                color: "#262b3d",
                lineHeight: "140%",
              }}
            >
              <div style={{ display: "flex" }}>{scoreText}</div>
              <div style={{ display: "flex" }}>{formatDuration(p.ms)}</div>
            </div>
          </div>
        )}

        <div
          style={{
            display: "flex",
            fontFamily: "Overpass Mono",
            fontWeight: 500,
            fontSize: 24,
            lineHeight: "30px",
            color: "#dc1c61",
            letterSpacing: "-2%",
          }}
        >
          moravec.elgatoylacaja.com
        </div>
      </div>
    </div>
  );
}
