import { Api } from "../api/Api";
import type { Level } from "../level";

export type LevelFetchResult =
  | { status: "found"; mix: Level }
  /** A real 404 — the backend was reachable and said this Level number doesn't exist. */
  | { status: "not-found" }
  /** The backend couldn't be reached at all — the caller should fall back to the local replica. */
  | { status: "unreachable" };

/** Classifies a Level fetch so the Server Component never crashes on a network failure. */
export async function fetchLevelForPage(levelNumber: number): Promise<LevelFetchResult> {
  try {
    const mix = await Api.fetchLevel(levelNumber);
    return mix === null ? { status: "not-found" } : { status: "found", mix };
  } catch {
    return { status: "unreachable" };
  }
}
