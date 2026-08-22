# 03: Sync per-keystroke timing to the backend

**What to build:** Each trial's keystroke trace (already captured locally, per `TrialResult.keystrokes`) gets included in what's synced to the backend for a logged-in User, instead of being dropped at the sync boundary. This supersedes ADR-0003.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [x] `pushResults`'s payload includes each trial's keystroke trace, not just the summary fields it sends today.
- [x] The backend stores the keystroke data against the corresponding trial (schema addition to `trial_results`, or an associated table — implementer's call, but must not silently drop the timestamps within each keystroke).
- [x] A new ADR records this decision and explicitly supersedes ADR-0003 (`docs/adr/0003-keystrokes-not-synced.md`), explaining why the original reasoning ("no consumer yet") no longer holds now that data integrity for the underlying research use case is worth investing in.
- [x] Existing sync behavior (results, level-stats) is unaffected; this is additive to the payload.
