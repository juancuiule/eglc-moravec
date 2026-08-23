"use client";

import { useEffect } from "react";
import { authStore } from "./store";

/**
 * Hydrates the auth store from a persisted session, then validates it
 * against the backend — both once, on first mount (client-only; see
 * AuthStore.hydrate for why this can't happen at store-creation time).
 */
export function AuthBoot() {
  useEffect(() => {
    authStore.getState().hydrate();
    void authStore.getState().restoreSession();
  }, []);

  return null;
}
