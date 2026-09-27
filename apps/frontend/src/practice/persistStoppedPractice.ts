import { toTrialResultInputs } from "engine";
import { kickSync } from "../local/syncEngine";
import { enqueueRun } from "../local/trials";
import type { PracticeStopped } from "./index";

/**
 * Persists a stopped Practice session into the local-first outbox —
 * unconditionally, mirroring persistFinishedLevel.ts's Level equivalent.
 * Trial inputs are minted at the stop edge (ids/playedAt frozen at the true
 * instant), written to the durable store, then the sync engine is kicked.
 * Session establishment and retries live in the engine, not here.
 */
export function persistStoppedPractice(state: PracticeStopped): void {
  const inputs = toTrialResultInputs(
    state.results,
    {
      runType: "practice",
      levelNumber: null,
      runId: state.runId,
    },
    Date.now(),
  );
  enqueueRun(inputs, state.results);
  kickSync();
}
