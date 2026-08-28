import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";

export type StorageStoreState = {
  /**
   * True once the IndexedDB persister has finished its initial load into
   * `store` (see StorageBoot). Reading `store` before this is true risks
   * seeing an empty table even though persisted data exists — components
   * that read trial/level-stats data must wait for this to flip, the same
   * way authStore.hydrate() must run before AuthState is trustworthy.
   */
  ready: boolean;
};

export const storageStore = createStore<StorageStoreState>(() => ({
  ready: false,
}));

export function useStorage<T>(selector: (s: StorageStoreState) => T): T {
  return useStore(storageStore, selector);
}
