import { toTrialResultInput, type TrialResultPolicy } from "engine";
import type { StoreApi } from "zustand/vanilla";
import { enqueueRun } from "../local/trials";
import { isPlaying, type TrialSessionState } from "./index";

// Any session store — Level's or Practice's — narrowed to what's read here.
type SessionStore<TConfig> = Pick<
  StoreApi<{ state: TrialSessionState<TConfig, { type: string }, unknown> }>,
  "subscribe"
>;

function scoredResult<TConfig>(
  state: TrialSessionState<TConfig, { type: string }, unknown>,
) {
  return isPlaying(state) && state.playingState.type === "reviewing"
    ? state.playingState.result
    : null;
}

/**
 * Writes every Trial to the local-first outbox the moment it's scored —
 * the only place a session's Trials are written. A player who refreshes
 * after a wrong answer (to restart the Level clean) still leaves that
 * answer, and the whole abandoned run so far, in their history. Only
 * written locally: the rows ride the next flush (finish/stop, boot,
 * reconnect, leaving a Level), so a Level doesn't cost a request per Trial.
 *
 * Keyed on the scored result's identity, not on a "reviewing" edge alone,
 * so each Trial is enqueued exactly once.
 */
export function persistScoredTrials<TConfig>(
  store: SessionStore<TConfig>,
  recordPolicy: (config: TConfig, runId: string) => TrialResultPolicy,
): () => void {
  return store.subscribe(({ state }, { state: prevState }) => {
    const result = scoredResult(state);
    if (!isPlaying(state) || result === null) return;
    if (result === scoredResult(prevState)) return;
    enqueueRun(
      [toTrialResultInput(result, recordPolicy(state.config, state.runId))],
      [result],
    );
  });
}
