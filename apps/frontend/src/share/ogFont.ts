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

// Loaded once at module scope — both OG image routes share it.
export const ogFonts = Promise.all([
  font("OverpassMono-Regular.ttf"),
  font("OverpassMono-Bold.ttf"),
]).then(([regularData, boldData]) => [
  { name: "Overpass Mono" as const, data: regularData, weight: 400 as const },
  { name: "Overpass Mono" as const, data: boldData, weight: 700 as const },
]);
