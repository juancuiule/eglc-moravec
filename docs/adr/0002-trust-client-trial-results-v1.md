# Trust client-submitted Trial results in v1; no server-side anti-cheat

Cheat-resistance was one of the stated goals for adding a backend (alongside cross-device Sync and a future leaderboard), but re-validating a submitted TrialResult server-side means re-deriving `operations/`'s solve-time rules on the backend — real duplicated logic, not just duplicated types. We're deliberately not building that for v1: the backend stores whatever the client reports, unvalidated beyond basic shape checks.

This is a conscious trade-off, not an oversight — a forged score is possible today by calling the sync endpoint directly. Revisit only after there's an actual cheating incident worth the cost of fixing, and treat that moment as the trigger described in ADR-0001: it's the same signal that justifies extracting the `engine` package.
