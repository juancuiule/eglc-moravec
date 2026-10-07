import { toTrialResultInput } from "engine";
import { kickSync } from "../local/syncEngine";
import { enqueueRun } from "../local/trials";
import { practiceRecordPolicy, type PracticeStopped } from "./index";

/**
 * Persists a stopped Practice session into the local-first outbox —
 * unconditionally, mirroring persistFinishedLevel.ts's Level equivalent.
 * Every Trial was already enqueued the moment it was scored (see
 * persistScoredTrials); re-enqueueing here lands on the same ids, so this
 * is a no-op safety net for the rows plus the sync kick. Session
 * establishment and retries live in the engine, not here.
 */
export function persistStoppedPractice(state: PracticeStopped): void {
  const policy = practiceRecordPolicy(state.config, state.runId);
  enqueueRun(
    state.results.map((r) => toTrialResultInput(r, policy)),
    state.results,
  );
  kickSync();
}
