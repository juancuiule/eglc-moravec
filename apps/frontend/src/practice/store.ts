import { useStore } from "zustand";
import { persistScoredTrials } from "../trialSession/persistScoredTrials";
import { createPracticeStore, practiceRecordPolicy } from "./index";
import type { PracticeStore } from "./index";

export const practiceStore = createPracticeStore();

// Same lifetime as gameStore's — see game/store.ts.
persistScoredTrials(practiceStore, practiceRecordPolicy);

export function usePractice<T>(selector: (s: PracticeStore) => T): T {
  return useStore(practiceStore, selector);
}
