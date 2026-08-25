"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        // TanStack Query's own default (3 retries, exponential backoff) means
        // a genuinely unreachable backend doesn't report isError for several
        // seconds — the opposite of what this app wants: fall back to the
        // locally-replicated data fast, not retry-then-fall-back.
        defaultOptions: { queries: { retry: false } },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
