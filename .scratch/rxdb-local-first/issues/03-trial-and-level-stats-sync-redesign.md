# 03: Redesign Trial and Level-stats sync around RxDB (scoping ticket)

**What to build:** This is a scoping ticket, not a full design — resolve the open questions below when this ticket is actually picked up, rather than assuming answers now. Trial results and Level stats currently sync to the backend via a fire-and-forget push with no retry: a submission is lost for good if it fails while the player is offline and the app is later closed before reconnecting. Redesign this as RxDB push replication instead, so a Trial submission is queued locally and retried automatically until it reaches the backend — the same reliability the Level catalog work (tickets 01–02) already gives read data, extended to writes. Correctness must remain server-verified exactly as it is today: the backend independently recomputes whether a submitted answer was actually correct from the raw operands, answer, and time taken, using the same scoring rules the client uses — the client's local copy must never become something that can simply assert its own correctness. The existing anonymous-identity-upgrade behavior (an anonymous player's history folding into their account once they log in) must keep working, unchanged.

**Blocked by:** 01 (Set up RxDB and locally replicate the Level catalog)

**Status:** ready-for-agent

Open questions to resolve when this ticket is picked up:

- [ ] How the backend's independent correctness re-check is expressed in RxDB's conflict-resolution contract (e.g. always return the server-recomputed record and let the client's conflict handler resolve to it, vs. some other shape).
- [ ] Whether the Level-stats "best record wins" comparison (more stars, or same stars with less time) becomes a client-side conflict handler, a server-side rule, or both.
- [ ] Any change needed to the anonymous-identity-upgrade flow's interaction with a continuously-replicated dataset, versus today's one-shot push.

Acceptance criteria:

- [ ] A finished Level's Trial results reliably reach the backend even if the device was offline when the Level was finished — no submission is silently lost if the app is closed before reconnecting.
- [ ] The backend still independently verifies correctness for every submitted Trial — the client's own claim is never trusted outright.
- [ ] Level stats (the best-ever record per Level) merge correctly from multiple devices/sessions using the existing "more stars, or same stars with less time" comparison.
- [ ] An anonymous player's history still correctly folds into their account when they log in, unchanged from today's behavior.
- [ ] Practice sessions remain unaffected by this ticket — they aren't synced yet (see ticket 04).
