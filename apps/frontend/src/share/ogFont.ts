import { readFile } from "node:fs/promises";
import { join } from "node:path";

// Overpass Mono for the ImageResponse cards — the webfont is woff2, which
// satori can't parse, so the TTFs ship under public/og-fonts (OFL license
// included alongside). public/ is the one directory copied into the
// standalone image, but its cwd-relative path differs between `next
// dev`/`next start` (apps/frontend) and the Docker runtime (/app) — try
// both roots.
const FONT_DIRS = [
  join(process.cwd(), "public/og-fonts"),
  join(process.cwd(), "apps/frontend/public/og-fonts"),
];

async function font(name: string): Promise<Buffer> {
  for (const dir of FONT_DIRS) {
    try {
      // turbopackIgnore on the join: the path is runtime-computed across
      // two roots — tracing can't see it, and the file is served from
      // public/ which is copied into the standalone image wholesale anyway.
      return await readFile(join(/* turbopackIgnore: true */ dir, name));
    } catch {
      // try the next candidate root
    }
  }
  throw new Error(`OG font not found: ${name} (tried ${FONT_DIRS.join(", ")})`);
}

// Gotham is commercial — its files are dropped into public/og-fonts at
// build/deploy time rather than committed. Absent files degrade to Overpass
// Mono (see ogFonts below), so the card still renders.
async function optionalFont(
  names: string[],
  weight: 500 | 900,
): Promise<{ name: "Gotham"; data: Buffer; weight: 500 | 900 } | null> {
  for (const dir of FONT_DIRS) {
    for (const name of names) {
      try {
        const data = await readFile(
          join(/* turbopackIgnore: true */ dir, name),
        );
        return { name: "Gotham", data, weight };
      } catch {
        // try the next candidate
      }
    }
  }
  return null;
}

type OgFont = {
  name: string;
  data: Buffer;
  weight: 400 | 500 | 700 | 900;
};

async function loadFonts(): Promise<{
  fonts: OgFont[];
  hasGotham: boolean;
}> {
  const [regular, medium, bold] = await Promise.all([
    font("OverpassMono-Regular.ttf"),
    font("OverpassMono-Medium.ttf"),
    font("OverpassMono-Bold.ttf"),
  ]);
  const gotham = [
    await optionalFont(["Gotham-Black.ttf", "Gotham-Black.otf"], 900),
    await optionalFont(["Gotham-Medium.ttf", "Gotham-Medium.otf"], 500),
  ].filter((f): f is NonNullable<typeof f> => f !== null);
  return {
    fonts: [
      { name: "Overpass Mono", data: regular, weight: 400 },
      { name: "Overpass Mono", data: medium, weight: 500 },
      { name: "Overpass Mono", data: bold, weight: 700 },
      ...gotham,
    ],
    hasGotham: gotham.length > 0,
  };
}

// Loaded once at module scope — the share OG route uses it.
export const ogFonts = loadFonts();
