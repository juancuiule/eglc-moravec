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
let activePersister: ReturnType<typeof createIndexedDbPersister> | null = null;
// Generous — legit slow IndexedDB loads should win; this only fires when
// open() truly hangs.
const HYDRATION_TIMEOUT_MS = 10_000;

// Force a durable write now. Callers that hand rows to the in-memory store
// (e.g. restoring an account stash) use this before releasing the previous
// durable copy — resolves false when there is no live persister or the
// write itself failed.
export function persistNow(): Promise<boolean> {
  return (
    activePersister?.save().then(
      () => true,
      () => false,
    ) ?? Promise.resolve(false)
  );
}

// Idempotent, browser-only. Called from AuthBoot; SSR and tests leave the
// store in-memory and can flip HYDRATED_VALUE directly.
export function ensureLocalPersistence(): void {
  if (persisterStarted) return;
  // No IndexedDB at all, a persister constructor throw, or a failed
  // startAutoPersisting all degrade the same way: flip hydrated and run the
  // session in-memory rather than leaving every reader on "loading".
  if (typeof indexedDB === "undefined") {
    localStore.setValue(HYDRATED_VALUE, true);
    return;
  }
  persisterStarted = true;
  const markHydrated = () => localStore.setValue(HYDRATED_VALUE, true);
  try {
    const persister = (activePersister = createIndexedDbPersister(
      localStore,
      "moravec",
      undefined,
      // TinyBase swallows IDB failures internally — without this, every
      // broken-storage write retries a doomed open() in total silence.
      (e) => console.warn("local persistence error", e),
    ));
    // Real IDB errors (private mode, denied quota) still settle this promise
    // — TinyBase converts them to ignored errors — so both branches mark
    // hydrated. The setTimeout backstop covers the nastier case: an
    // indexedDB.open whose callbacks never fire (hung WebKit/FF-private
    // opens) leaves the promise pending forever.
    void persister.startAutoPersisting().then(markHydrated, markHydrated);
    setTimeout(() => {
      if (isLocalStoreHydrated()) return;
      markHydrated();
      // Best-effort: drops queued persister actions so a late-resolving load
      // can't clobber post-timeout in-memory writes. Never awaited.
      void persister.destroy();
      activePersister = null;
    }, HYDRATION_TIMEOUT_MS);
  } catch {
    markHydrated();
  }
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
//
// Wiping also advances the local epoch: async continuations (an in-flight
// pull-merge, a push's markSynced) capture the epoch before their request
// and must check it after — an old session's response must never repopulate
// a store that now belongs to the next session.
let epoch = 0;
export function localEpoch(): number {
  return epoch;
}

// Armed synchronously when logout's wipe is queued while hydration is still
// pending — cleared inside the same hydration listener chain that wipes.
// TinyBase fires value listeners in registration order, so a flush deferred
// BEFORE the hook could otherwise run first and push the outgoing session's
// pending rows under the freshly-minted anonymous token.
let wipePending = false;
export function markWipePending(): void {
  wipePending = true;
}
export function isWipePending(): boolean {
  return wipePending;
}

// Store-value mirror of the module epoch — written on every wipe purely as
// a re-render trigger (a wipe with an empty table otherwise notifies
// nothing). Components compare the module epoch, never this value: the
// mirror can persist stale numbers across reloads and load() can even
// overwrite a mid-load bump — both only matter for scheduling a re-render.
export const EPOCH_VALUE = "localEpoch";

export function resetLocalData(): void {
  epoch += 1;
  wipePending = false;
  localStore.setValue(EPOCH_VALUE, epoch);
  localStore.delTable(TRIALS_TABLE);
}
