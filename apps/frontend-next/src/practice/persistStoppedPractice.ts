import type { PracticeStopped } from "./index";
import { appendPracticeTrials, buildPersistedPracticeTrials } from "../storage/practiceHistory";

/**
 * Persists a stopped Practice session locally. Local-only by design — per
 * the grilling session, Practice is low-stakes and doesn't need Sync.
 */
export function persistStoppedPractice(state: PracticeStopped): void {
  appendPracticeTrials(buildPersistedPracticeTrials(state.results));
}
