import { createStore, type Store } from "tinybase";
import { createIndexedDbPersister } from "tinybase/persisters/persister-indexed-db";

const DB_NAME = "moravec-local";

/**
 * The local-first data store: two schema-less tables, `trials` and
 * `levelRuns`, both keyed by a client-generated id. Schema-less on purpose —
 * a Practice trial's absent `levelNumber` is represented by the cell simply
 * not being set, not by a null value (TinyBase cells are string/number/
 * boolean only), and `keystrokes` is stored JSON-stringified since TinyBase
 * cells are flat. No row caps: the old 2000-row limit on the localStorage
 * predecessors existed only because of localStorage's size ceiling, which
 * doesn't apply once this is IndexedDB-backed.
 *
 * A third table, `levels`, caches each fetched Level's mix keyed by level
 * number (as a string row id) — an offline-read fallback for the backend's
 * `levels` catalog, not player-generated data like the other two tables. See
 * `storage/levelCache.ts`.
 */
export function createLocalStore(): Store {
  return createStore();
}

/** The store every storage/*.ts module reads and writes — one per tab. */
export const localStore: Store = createLocalStore();

/**
 * Clears every row and Value (e.g. the sync cursor). Used in tests
 * (mirroring the localStorageMock.clear() convention used elsewhere in
 * this codebase's storage tests) and for real, on logout — see
 * auth/store.ts's logout(), which clears local data so a shared browser's
 * next login can't inherit the outgoing user's still-pending trials.
 */
export function resetLocalStore(): void {
  localStore.delTables();
  localStore.delValues();
}

let persistenceInit: Promise<void> | null = null;

/**
 * Hydrates `localStore` from IndexedDB, then keeps every subsequent write
 * saved back automatically. Browser-only: SSR and this codebase's jsdom
 * test environment both lack `indexedDB`, so this resolves immediately
 * without touching anything there — safe to call unconditionally. Memoized
 * so calling it more than once (React effects can fire twice in dev) only
 * opens the database once.
 */
export function initLocalStorePersistence(): Promise<void> {
  if (persistenceInit) return persistenceInit;
  if (typeof indexedDB === "undefined") return Promise.resolve();

  const persister = createIndexedDbPersister(localStore, DB_NAME);
  persistenceInit = persister.startAutoLoad().then(() => {
    void persister.startAutoSave();
  });
  return persistenceInit;
}
