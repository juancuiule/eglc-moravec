# 04: Sync Practice history to the backend (scoping ticket)

**What to build:** Another scoping ticket, not a full design. Practice sessions are currently local-only and never leave the device — confirmed to be an oversight, not an intentional design choice. Once Trial and Level-stats sync has been redesigned around RxDB (ticket 03), extend that same reliable sync to Practice trials too, so practice history is preserved and available across devices the same way Level history already is. A Practice trial doesn't belong to a Level, so it needs its own way of being distinguished from a Level trial in the shared trial history, and its own run identifier grouping its trials together (Level runs already have one; Practice sessions currently don't). Practice has no "stars" or "completed" concept the way a Level does, so no new best-record-style summary is needed for it — just a reliable, tagged trial history, matching the append-only shape the rest of this data already has.

**Blocked by:** 03 (Redesign Trial and Level-stats sync around RxDB)

**Status:** ready-for-agent

Open questions to resolve when this ticket is picked up:

- [ ] Confirm the exact shape used to distinguish a Level trial from a Practice trial in the shared trial history, and to group a Practice session's trials together (mirroring how a Level run is already grouped).
- [ ] Confirm no user-visible "Practice stats" summary is introduced as part of this ticket (out of scope unless requested separately later).

Acceptance criteria:

- [ ] A Practice session's trial results reliably reach the backend, using the same reliability guarantees established for Level trials in ticket 03.
- [ ] A Practice trial is clearly distinguishable from a Level trial in the backend's trial history, and a Practice session's trials are grouped together the way a Level run's are.
- [ ] No new "best Practice record" concept or UI is introduced as part of this ticket.
- [ ] Existing Level trial history and stats are unaffected.
