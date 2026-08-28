"use client";

import { useCreatePersister } from "tinybase/ui-react";
import { createIndexedDbPersister } from "tinybase/persisters/persister-indexed-db";
import { store } from "./store";
import { storageStore } from "./storageStore";

/**
 * Sets up IndexedDB persistence for `store`, client-only — mirrors
 * AuthBoot's pattern (a boot component that fires async setup on mount,
 * rendered once in the root layout). useCreatePersister handles creating
 * the persister exactly once and cleaning it up on unmount; the `then`
 * callback is where the initial load + auto-save actually start, and is
 * the one place storageStore.ready flips to true.
 */
export function StorageBoot() {
  useCreatePersister(
    store,
    (s) => createIndexedDbPersister(s, "moravec-store"),
    [],
    async (persister) => {
      await persister.startAutoLoad();
      await persister.startAutoSave();
      storageStore.setState({ ready: true });
    },
  );

  return null;
}
