"use client";

import { useEffect } from "react";
import { authStore } from "./store";

/** Validates a persisted session against the backend once, on first mount. */
export function AuthBoot() {
  useEffect(() => {
    void authStore.getState().restoreSession();
  }, []);

  return null;
}
