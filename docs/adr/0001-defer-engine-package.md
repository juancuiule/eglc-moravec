# Split into a 2-package monorepo now; defer the engine package

We're building a backend (Fastify + SQLite) alongside the existing frontend to support OTP login and cross-device Sync. The original idea was a 3-package split (`frontend` / `backend` / `engine`, with game logic and types shared via `engine`), but at the time of this decision the backend has no real consumer for that shared logic yet: v1 trusts client-submitted Trial results rather than re-deriving Operation-level scoring server-side. Per "two adapters make a real seam," one real consumer (`frontend`) and one hypothetical one isn't enough to justify the extraction, so we're starting with a plain `pnpm` workspace of `apps/frontend` + `apps/backend` and hand-duplicating any overlapping types for now.

**Extraction trigger:** pull shared logic into an `engine` package specifically when the backend needs to re-derive `operations/`-level scoring — not before. See ADR-0002.
