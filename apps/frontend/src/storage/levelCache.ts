import { Api } from "@/api/Api";
import { localStore } from "./store";

/** The last-fetched mix for a Level number, or null if never cached. */
export function loadCachedLevel(levelNumber: number): Record<string, number> | null {
  const row = localStore.getRow("levels", String(levelNumber));
  return Object.keys(row).length > 0 ? (row as Record<string, number>) : null;
}

/** Populated opportunistically whenever a Level fetch succeeds — never the primary source, only an offline fallback. */
export function cacheLevel(levelNumber: number, mix: Record<string, number>): void {
  localStore.setRow("levels", String(levelNumber), mix);
}

/**
 * Fetches a Level's mix, caching it locally on success. A genuine 404
 * (the level doesn't exist) is returned as null and never masked by a
 * stale cache. Any other failure (offline, backend down) falls back to
 * whatever was last cached for this level number, so a previously-visited
 * Level can still be played offline; if nothing was ever cached, the
 * failure is rethrown.
 */
export async function fetchLevelWithFallback(
  levelNumber: number,
): Promise<Record<string, number> | null> {
  try {
    const mix = await Api.fetchLevel(levelNumber);
    if (mix === null) return null;
    cacheLevel(levelNumber, mix);
    return mix;
  } catch (err) {
    console.log(`Failed to fetch level ${levelNumber}, falling back to cache:`, err);
    const cached = loadCachedLevel(levelNumber);
    if (cached) return cached;
    throw err;
  }
}

/**
 * Fetches and caches the whole Level catalog in one call, so a device can
 * play a Level offline even if it's never visited that Level before —
 * `fetchLevelWithFallback` alone only caches a Level once it's actually
 * been played. Best-effort: never rejects, since this is a background
 * cache warm-up (see its call site in AuthBoot), not a critical path —
 * a failure here just means the per-Level fallback stays lazy for
 * whichever Levels weren't already cached.
 */
export async function warmLevelCache(): Promise<void> {
  try {
    const levels = await Api.fetchAllLevels();
    levels.forEach(({ levelNumber, mix }) => cacheLevel(levelNumber, mix));
  } catch {
    // best-effort — see docstring above
  }
}
