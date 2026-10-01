import { ImageResponse } from "next/og";
import { ogFonts } from "@/share/ogFont";

// Root social card — statically generated at build (see the file-convention
// docs: no request-time APIs → prerendered and cached). The glyph mirrors
// public/moravec.svg: teal square outline + pink circle outline.
export const alt = "EGLC Moravec — mental-math training";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
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
          fontSize: 96,
          fontWeight: 700,
          color: "#262b3d",
          letterSpacing: -3,
        }}
      >
        EGLC Moravec
      </div>
      <div
        style={{
          display: "flex",
          fontSize: 38,
          fontWeight: 400,
          color: "#585e69",
          marginTop: 30,
          maxWidth: 700,
        }}
      >
        Mental-math training — progressive levels, focused practice.
      </div>
      <div
        style={{
          display: "flex",
          width: 96,
          height: 12,
          background: "#ef2172",
          borderRadius: 6,
          marginTop: 56,
        }}
      />
    </div>,
    {
      ...size,
      fonts: await ogFonts,
    },
  );
}
