import { createOperation, type TrialResult } from "engine";
import { createStore, type StoreApi } from "zustand/vanilla";
import {
  trialSessionActions,
  type Playing as TrialSessionPlaying,
  type TrialSessionPolicy,
  type TrialSessionStore,
} from "../trialSession";

export type PracticeConfig = {
  categoryCodename: string;
};

export type PracticeStopped = {
  type: "stopped";
  config: PracticeConfig;
  runId: string;
  results: TrialResult[];
};

// hintsRemaining stays number | undefined — genuinely undefined always,
// Practice hints are unbudgeted, not a gap to fill in later.
export type PracticePlaying = TrialSessionPlaying<PracticeConfig, undefined>;

export type PracticeState =
  { type: "idle" } | PracticePlaying | PracticeStopped;

export type PracticeStore = Omit<
  TrialSessionStore<PracticeConfig, PracticeStopped, undefined>,
  "state" | "forceComplete"
> & { state: PracticeState; stop: () => void };

export const policy: TrialSessionPolicy<
  PracticeConfig,
  PracticeStopped,
  undefined
> = {
  initialHintsRemaining: () => undefined,
  initialPickState: () => undefined,
  pickNext: (config) => ({
    operation: createOperation(config.categoryCodename),
    pickState: undefined,
  }),
  isComplete: () => false, // Practice never auto-completes via advance
  buildTerminalState: (results, config, runId) => ({
    type: "stopped",
    config,
    runId,
    results,
  }),
};

export function createPracticeStore(): StoreApi<PracticeStore> {
  type FullStore = TrialSessionStore<
    PracticeConfig,
    PracticeStopped,
    undefined
  > & { stop: () => void };

  return createStore<FullStore>((set, get) => ({
    state: { type: "idle" },
    ...trialSessionActions(policy, set, get),
    stop() {
      get().forceComplete();
    },
  })) as unknown as StoreApi<PracticeStore>;
}
