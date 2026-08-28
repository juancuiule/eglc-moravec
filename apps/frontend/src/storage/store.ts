import { createStore } from "tinybase";

/**
 * The one TinyBase Store for this app's local-first data — created eagerly
 * at module load (safe on both server and client: an in-memory Store needs
 * no browser API to exist). Actual IndexedDB persistence is wired up
 * separately, client-only, by StorageBoot — see its comment for why.
 */
export const store = createStore();
