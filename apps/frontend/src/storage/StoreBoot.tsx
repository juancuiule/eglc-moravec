"use client";

import { useEffect, useState, type ReactNode } from "react";
import { initLocalStorePersistence } from "./store";

/**
 * Gates rendering of `children` until the local store has finished loading
 * from IndexedDB. Necessary because none of storage/*.ts's load*() reads are
 * reactive — a component reading them at mount before hydration finishes
 * would render stale/empty data and never get a chance to re-render once
 * the real data lands. SSR (and this app's first paint) has no IndexedDB at
 * all, so `ready` starts false on both server and client to avoid a
 * hydration mismatch, then flips true as soon as the client-side load
 * resolves — typically fast enough not to be felt.
 */
export function StoreBoot({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void initLocalStorePersistence().then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) return null;
  return <>{children}</>;
}
