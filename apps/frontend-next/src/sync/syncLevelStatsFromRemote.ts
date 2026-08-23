import { Api } from "../api/Api";
import { mergeRemoteLevelStats } from "../storage/levelStats";

/**
 * Pull the logged-in User's remote LevelStats and merge them into local
 * storage. Best-effort — a failed pull never blocks or interrupts login.
 */
export async function syncLevelStatsFromRemote(token: string): Promise<void> {
  try {
    const remote = await Api.pullLevelStats(token);
    mergeRemoteLevelStats(remote);
  } catch {
    // best-effort
  }
}
