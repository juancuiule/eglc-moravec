import { toTrialResultInput, type TrialResultPolicy } from "engine";
import { enqueueRun } from "../local/trials";
import type { Playing } from "./index";

// Any session store — Level's or Practice's — narrowed to what's read here.
type SessionStore<TConfig> = {
  subscribe: (
    listener: (
      store: { state: { type: string } },
      prevStore: { state: { type: string } },
    ) => void,
  ) => () => void;
};

function isPlaying<TConfig>(state: {
  type: string;
}): state is Playing<TConfig, unknown> {
  return state.type === "playing";
}

function scoredResult(state: { type: string }) {
  return isPlaying(state) && state.playingState.type === "reviewing"
    ? state.playingState.result
    : null;
}

/**
 * Writes every Trial to the local-first outbox the moment it's scored —
 * not when the Level finishes or Practice stops. A player who refreshes
 * after a wrong answer (to restart the Level clean) still leaves that
 * answer, and the whole abandoned run so far, in their history. Only
 * written locally: the rows ride the next flush (finish/stop, boot,
 * reconnect), so a Level doesn't cost a request per Trial.
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
    if (result === null || result === scoredResult(prevState)) return;
    if (!isPlaying<TConfig>(state)) return;
    enqueueRun(
      [toTrialResultInput(result, recordPolicy(state.config, state.runId))],
      [result],
    );
  });
}
