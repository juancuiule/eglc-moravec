import { useStore } from "zustand";
import { createPracticeStore } from "./index";
import type { PracticeStore } from "./index";

export const practiceStore = createPracticeStore();

export function usePractice<T>(selector: (s: PracticeStore) => T): T {
  return useStore(practiceStore, selector);
}
