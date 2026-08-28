"use client";

import { useEffect } from "react";
import { authStore } from "./store";
import { sync } from "../sync/syncEngine";

/**
 * Hydrates the auth store from the session cookie, once on first mount
 * (client-only; see AuthStore.hydrate for why this can't happen at
 * store-creation time). Validation against the backend already happened
 * server-side in proxy.ts before this page rendered — nothing here
 * makes a network call for an existing session.
 *
 * If hydrate() finds no session cookie at all, ensureSession() mints a
 * fresh anonymous one — this is the one place that happens,
 * so every player has somewhere to sync trials to from their very first
 * Level, not just after choosing to log in.
 *
 * Two more sync triggers live here alongside boot, beyond Level-finish/
 * Practice-stop (see sync/syncEngine.ts): one attempt right after boot's
 * own ensureSession() settles (covers reloading while already back online),
 * and a `window` `online` listener for reconnecting without a reload —
 * this only syncs while the tab stays open; a closed-tab background sync
 * would need a Service Worker + Background Sync API, out of scope here.
 */
export function AuthBoot() {
  useEffect(() => {
    authStore.getState().hydrate();

    void authStore.getState().ensureSession().then(() => {
      void sync(authStore.getState().state);
    });

    async function handleOnline() {
      if (authStore.getState().state.type === "loggedOut") {
        await authStore.getState().ensureSession();
      }
      void sync(authStore.getState().state);
    }

    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, []);

  return null;
}
