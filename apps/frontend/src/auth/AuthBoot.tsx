"use client";

import { useEffect } from "react";
import { authStore } from "./store";

/**
 * Hydrates the auth store from the session cookie, once on first mount
 * (client-only; see AuthStore.hydrate for why this can't happen at
 * store-creation time). Validation against the backend already happened
 * server-side in proxy.ts before this page rendered — nothing here
 * makes a network call.
 */
export function AuthBoot() {
  useEffect(() => {
    authStore.getState().hydrate();
  }, []);

  return null;
}
