import { useStore } from "zustand";
import { persistScoredTrials } from "../trialSession/persistScoredTrials";
import { createGameStore, policy, type GameStore } from "./index";

export const gameStore = createGameStore();

// For the app's lifetime, not a component's: a Trial must reach the outbox
// even if the screen showing it unmounts mid-review.
persistScoredTrials(gameStore, policy.recordPolicy);

export function useGame<T>(selector: (s: GameStore) => T): T {
  return useStore(gameStore, selector);
}
