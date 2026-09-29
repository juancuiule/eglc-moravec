import { Api, type LevelStats } from "@/api/Api";
import { fetchStatsSeed } from "@/api/statsSeed";
import type { Level } from "@/level";

export type LevelPageData =
  | {
      status: "found";
      mix: Level;
      stats: Record<string, LevelStats>;
      nextLevelNumber: number | null;
    }
  /** A real 404 — the backend was reachable and said this Level doesn't exist. */
  | { status: "not-found" }
  /**
   * The backend couldn't be reached — the caller falls back to the local
   * catalog snapshot. fetchStatsSeed never throws, so a throw here means
   * the level mix or the catalog request failed: the network is down, or
   * the frontend is up while the backend isn't.
   */
  | { status: "unreachable" };

// Everything /level/[n]'s Server Component needs, classified so a dead
// backend renders the local-data fallback instead of the error boundary.
export async function fetchLevelForPage(
  levelNumber: number,
): Promise<LevelPageData> {
  let mix: Level | null;
  let catalog: number[];
  let stats: Record<string, LevelStats>;
  try {
    [mix, catalog, stats] = await Promise.all([
      Api.fetchLevel(levelNumber),
      Api.fetchLevelNumbers(),
      fetchStatsSeed(),
    ]);
  } catch {
    return { status: "unreachable" };
  }
  if (mix === null) return { status: "not-found" };

  // The backend catalog — not a fixed level count — decides whether there is
  // a next Level and what its number is.
  const index = catalog.indexOf(levelNumber);
  const nextLevelNumber = index === -1 ? null : (catalog[index + 1] ?? null);
  return { status: "found", mix, stats, nextLevelNumber };
}
