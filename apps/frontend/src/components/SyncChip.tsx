"use client";

import { usePendingOutboxCount } from "@/local/hooks";
import { useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";

// navigator.onLine as reactive state — SSR/hydration snapshot is `true` so
// the chip never flashes "offline" in server HTML; the real value applies
// after mount.
function useOnline(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      window.addEventListener("online", onChange);
      window.addEventListener("offline", onChange);
      return () => {
        window.removeEventListener("online", onChange);
        window.removeEventListener("offline", onChange);
      };
    },
    () => navigator.onLine,
    () => true,
  );
}

/**
 * The local-first story made visible: a slim pill at the very top of the
 * viewport — inside the breathing room above the panel, never over content —
 * shown only when there's something to say: the device is offline, or outbox
 * rows are still waiting to push. Hidden otherwise. Non-interactive (the
 * counts are informational; taps fall through).
 */
export function SyncChip() {
  const t = useTranslations("Offline");
  const online = useOnline();
  const pending = usePendingOutboxCount();

  const pendingCount = pending ?? 0;
  // Hidden while online with nothing pending — including the pre-hydration
  // window (pending === undefined reads as 0, so "0 pending" never flashes
  // while IndexedDB loads). Offline shows immediately; the count joins once
  // hydrated.
  if (online && pendingCount === 0) return null;

  return (
    <div
      role="status"
      className={[
        "pointer-events-none fixed top-[max(0.125rem,env(safe-area-inset-top))] left-1/2 -translate-x-1/2 z-50",
        "flex items-center gap-1.5 rounded-full border border-subtle bg-panel/90 px-2.5 py-0.5",
        "text-2xs text-muted backdrop-blur-sm whitespace-nowrap",
      ].join(" ")}
    >
      <span
        aria-hidden
        className={`h-1.5 w-1.5 rounded-full ${online ? "bg-muted" : "bg-warning"}`}
      />
      {online ? null : (
        <>
          {t("offline")}
          {pendingCount > 0 && <span aria-hidden>·</span>}
        </>
      )}
      {pendingCount > 0 && t("pending", { count: pendingCount })}
    </div>
  );
}
