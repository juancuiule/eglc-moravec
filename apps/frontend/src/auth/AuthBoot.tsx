"use client";

import { useEffect } from "react";
import { authStore } from "./store";

/**
 * Hydrates the auth store from the session cookie, once on first mount
 * (client-only; see AuthStore.hydrate for why this can't happen at
 * store-creation time). Validation against the backend already happened
 * server-side in proxy.ts before this page rendered — nothing here
 * makes a network call for an existing session.
 *
 * If hydrate() finds no session cookie at all, ensureSession() mints a
 * fresh anonymous one (ADR-0009) — this is the one place that happens,
 * so every player has somewhere to sync trials to from their very first
 * Level, not just after choosing to log in.
 */
export function AuthBoot() {
  useEffect(() => {
    authStore.getState().hydrate();
    void authStore.getState().ensureSession();
  }, []);

  return null;
}
