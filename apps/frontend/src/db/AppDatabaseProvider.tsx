"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { RxDatabaseProvider } from "rxdb/plugins/react";
import { getAppDatabase, type AppDatabase } from "./database";
import { startAllReplications } from "./replication";

type Status =
  | { type: "loading" }
  | { type: "ready"; db: AppDatabase }
  | { type: "error" };

/**
 * Resolves the one app-wide database once, starts every collection's
 * replication, then wraps `children` in RxDB's own RxDatabaseProvider —
 * every hook from `rxdb/plugins/react` (useRxCollection, useRxQuery,
 * useRxDocument, ...) needs to be called from underneath this. Renders
 * nothing while the database is still opening, which in practice only
 * happens once per full page load, not on every client-side navigation.
 *
 * On failure (e.g. IndexedDB blocked or unavailable), this shows an
 * explicit error with a retry rather than leaving the whole app silently
 * blank forever — getAppDatabase() already clears its own cached promise on
 * failure, so retrying here is a genuine fresh attempt, not a replay.
 */
export function AppDatabaseProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>({ type: "loading" });

  const start = useCallback(() => {
    let cancelled = false;
    setStatus({ type: "loading" });

    getAppDatabase()
      .then((database) => {
        if (cancelled) return;
        startAllReplications(database);
        setStatus({ type: "ready", db: database });
      })
      .catch((error: unknown) => {
        console.error("Couldn't open the local database:", error);
        if (cancelled) return;
        setStatus({ type: "error" });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => start(), [start]);

  if (status.type === "loading") return null;

  if (status.type === "error") {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="text-sm text-danger">Couldn't start the local database.</p>
          <button
            type="button"
            onClick={start}
            className="cursor-pointer rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return <RxDatabaseProvider database={status.db}>{children}</RxDatabaseProvider>;
}
