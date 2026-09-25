import { createStore } from "tinybase";
import { createIndexedDbPersister } from "tinybase/persisters/persister-indexed-db";

// One row per completed trial, keyed by TrialResultInput.id (the same id the
// backend dedupes on via INSERT OR IGNORE). Flat cells only — TinyBase has no
// nested values, so:
//   - `operands` is a JSON-encoded number[]
//   - `answer` is absent for timed-out trials (rehydrated to null)
//   - `levelNumber` is absent for practice rows (rehydrated to null)
//   - `keystrokes` is a reserved JSON string cell — written by nothing yet
//     (#68), but the row shape already carries the slot.
// `synced` marks whether the backend has acknowledged the row.
// `correct`/`timeExceeded` are display copies — filled from the local
// evaluation at finish time so stats/unlocks work offline, then overwritten
// by the server-authoritative values when a pull merges.
export type LocalTrialCell = {
  categoryCodename: string;
  operands: string;
  answer?: number;
  timeTaken: number;
  playedAt: number;
  hintShown: boolean;
  runType: string;
  levelNumber?: number;
  runId: string;
  synced: boolean;
  correct: boolean;
  timeExceeded: boolean;
  keystrokes?: string;
};

// Deliberately schema-less: row shape is enforced at the enqueue seam by
// TrialResultSchema (see trials.ts), which also guards against a poisoned
// queue. Schematized stores would fight the intentionally-optional cells.
export const localStore = createStore();

// The one flag readers gate on: the persister flips it once IndexedDB has
// been loaded into memory. Until then, readers must treat the store as
// "loading" — reading early risks seeing an empty store and (worse) letting
// auto-persist write that emptiness back over real data.
export const HYDRATED_VALUE = "hydrated";
export const TRIALS_TABLE = "trials";

export function isLocalStoreHydrated(): boolean {
  return localStore.getValue(HYDRATED_VALUE) === true;
}

let persisterStarted = false;

// Idempotent, browser-only. Called from AuthBoot; SSR and tests leave the
// store in-memory and can flip HYDRATED_VALUE directly.
export function ensureLocalPersistence(): void {
  if (persisterStarted || typeof indexedDB === "undefined") return;
  persisterStarted = true;
  const persister = createIndexedDbPersister(localStore, "moravec");
  persister
    .startAutoPersisting()
    .then(() => localStore.setValue(HYDRATED_VALUE, true))
    .catch(() => {
      // IndexedDB unavailable (private mode, quota) — stay hydrated so the
      // app works as an in-memory session rather than hanging on "loading".
      localStore.setValue(HYDRATED_VALUE, true);
    });
}

// True while a real IndexedDB persister exists but hasn't finished its
// initial load. Writes made in this window would be clobbered by the load —
// callers should defer via afterHydration.
export function isPersistenceLoading(): boolean {
  return persisterStarted && !isLocalStoreHydrated();
}

export function afterHydration(fn: () => void): void {
  if (!isPersistenceLoading()) {
    fn();
    return;
  }
  const listenerId = localStore.addValueListener(
    HYDRATED_VALUE,
    (_store, _valueId, newValue) => {
      if (newValue === true) {
        localStore.delListener(listenerId);
        fn();
      }
    },
  );
}

// Shared-browser logout: drops every local row (and the hydrated flag is left
// set — the store is still live, just empty). Auto-persist propagates the
// wipe to IndexedDB.
export function resetLocalData(): void {
  localStore.delTable(TRIALS_TABLE);
}
