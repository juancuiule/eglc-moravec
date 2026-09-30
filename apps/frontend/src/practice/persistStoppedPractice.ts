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
    // Focus trials stay in the practice family (levelNumber null) but carry
    // their own runType: the adaptively skewed category mix would bias the
    // operation distribution the research pipeline analyzes, so it's marked
    // for filtering rather than folded into uniform "practice" rows (#66).
    state.config.mode === "focus"
      ? {
          runType: "practice_focus" as const,
          levelNumber: null,
          runId: state.runId,
        }
      : {
          runType: "practice" as const,
          levelNumber: null,
          runId: state.runId,
        },
    Date.now(),
  );
  enqueueRun(inputs, state.results);
  kickSync();
}
