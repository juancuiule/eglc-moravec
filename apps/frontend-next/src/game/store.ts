import { useStore } from "zustand";
import { createGameStore, type GameStore } from "./index";

export const gameStore = createGameStore();

export function useGame<T>(selector: (s: GameStore) => T): T {
  return useStore(gameStore, selector);
}
