# 05: Backend independently re-validates correctness and timing

**What to build:** `POST /sync/results` recomputes each trial's `correct`/`timeExceeded` itself, from the operands/answer/timing data ticket 04 added, using the same scoring logic the client uses (`packages/engine`'s `scoreAnswer`/`scoreTimeout`) — rather than trusting the client's claim. This supersedes ADR-0002.

**Blocked by:** 04

**Status:** ready-for-agent

- [x] `apps/backend` depends on `packages/engine` and uses its scoring logic to independently recompute `correct` and `timeExceeded` for each incoming trial.
- [x] The server's own computed values are what get stored and used for anything analytical (admin stats aggregation, any future use) — not the client's claim.
- [x] The client's originally-submitted claim is kept alongside the server-computed values (for comparison / future auditing), not discarded.
- [x] A mismatch between client claim and server computation is never surfaced to the player, and never causes a sync failure or rejection — the sync still succeeds; the server's values just quietly win for storage purposes.
- [x] Nothing about this ever corrects or overrides a player's own local `LevelStats`/history — this is a backend-internal integrity signal only, per the grilling session.
- [x] A new ADR records this decision and explicitly supersedes ADR-0002 (`docs/adr/0002-trust-client-trial-results-v1.md`), explaining that the trigger condition it named (needing `operations/`-level knowledge server-side) has now genuinely fired.
- [x] Tests cover: a trial where the client's claim matches the server's recomputation, and one where they disagree — confirming the server's value is what's stored in both cases, and that a mismatch doesn't reject the sync.
