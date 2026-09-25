"use client";

import { useEffect } from "react";
import { authStore } from "./store";

const SESSION_RETRY_DELAYS_MS = [1_000, 2_000, 4_000] as const;

/**
 * Hydrates the auth store from the session cookie on first mount (client-only;
 * see AuthStore.hydrate for why this can't happen at store-creation time).
 * Validation against the backend already happened server-side in proxy.ts
 * before this page rendered, so existing sessions make no network request.
 *
 * When there is no session, anonymous registration is retried with bounded
 * backoff and when the browser comes online. Result persistence also makes one
 * lazy attempt so a completion during a recovery window is not dropped without
 * first trying to establish a session.
 */
export function AuthBoot() {
  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    let retryIndex = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    authStore.getState().hydrate();

    const clearRetry = () => {
      if (retryTimer !== undefined) {
        clearTimeout(retryTimer);
        retryTimer = undefined;
      }
    };

    const attemptSession = async () => {
      if (cancelled || inFlight) return;
      inFlight = true;
      await authStore.getState().ensureSession();
      inFlight = false;

      if (
        cancelled ||
        authStore.getState().state.type !== "logged-out" ||
        retryIndex >= SESSION_RETRY_DELAYS_MS.length
      ) {
        return;
      }

      const delay = SESSION_RETRY_DELAYS_MS[retryIndex++];
      retryTimer = setTimeout(() => {
        retryTimer = undefined;
        void attemptSession();
      }, delay);
    };

    const retryWhenOnline = () => {
      if (authStore.getState().state.type !== "logged-out") return;
      clearRetry();
      void attemptSession();
    };

    window.addEventListener("online", retryWhenOnline);
    void attemptSession();

    return () => {
      cancelled = true;
      clearRetry();
      window.removeEventListener("online", retryWhenOnline);
    };
  }, []);

  return null;
}
