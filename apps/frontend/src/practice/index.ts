import { createOperation, type TrialResult } from "engine";
import { createStore, type StoreApi } from "zustand/vanilla";
import {
  trialSessionActions,
  type Playing as TrialSessionPlaying,
  type TrialSessionPolicy,
  type TrialSessionStore,
} from "../trialSession";
import { pickFocusCategory, type FocusWeights } from "./focus";

/**
 * What a Practice session draws from. "category" is classic Practice — one
 * codename for the whole session. "focus" (#66) draws each Trial's category
 * from a weight map skewed toward the player's weakest categories; the map
 * is derived from local history at session start and frozen into the
 * config.
 */
export type PracticeConfig =
  | { mode: "category"; categoryCodename: string }
  | { mode: "focus"; weights: FocusWeights };

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

/**
 * Restart identity for a config — the mode, plus the codename for category
 * mode. A Focus config gets a fresh weights object whenever history is
 * re-derived; that's still the same session and must not restart a run.
 */
export function practiceConfigKey(config: PracticeConfig): string {
  return config.mode === "focus" ? "focus" : config.categoryCodename;
}

export const policy: TrialSessionPolicy<
  PracticeConfig,
  PracticeStopped,
  undefined
> = {
  initialHintsRemaining: () => undefined,
  initialPickState: () => undefined,
  pickNext: (config) => ({
    operation: createOperation(
      config.mode === "focus"
        ? pickFocusCategory(config.weights)
        : config.categoryCodename,
    ),
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
