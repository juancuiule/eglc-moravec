# 04: Push Trial results after a Level (fire-and-forget Sync)

**What to build:** When a logged-in User finishes a Level, its results sync to the backend in the background — play is never blocked waiting on the network. This is opt-in: it only happens for a logged-in User; anonymous play makes zero backend calls, per ticket 03's "login is additive" requirement.

**Blocked by:** 03

**Status:** ready-for-agent

- [x] Backend endpoint to accept a finished Level's results (Trial-level correctness, timing, Operation category, level number) for the current session's User, and store them.
- [x] Frontend: right after a Level finishes, if the player is logged in, `POST`s the results without blocking the `FinishedScreen` UI or awaiting the response — a failed or slow request never delays or interrupts play.
- [x] Verified: finish a Level while logged in, confirm the result is stored server-side (e.g. via a debug/read endpoint). Finish a Level while logged out, confirm no backend call is made at all.
- [x] No server-side re-validation of the submitted results (v1 trusts the client, per the grilling session) — this ticket is storage only, not anti-cheat.
