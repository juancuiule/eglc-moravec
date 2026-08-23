# 09: Practice route

**What to build:** Visiting `/practice` lets a player pick a category, do unlimited practice trials, stop, and see a summary — with local-only persistence, matching the current app exactly.

**Blocked by:** 06

**Status:** ready-for-agent

- [ ] The Practice state machine (mode selection, playing, stopped) behaves identically to the current app.
- [ ] Stopping a Practice session persists it locally exactly as today (never synced to the backend, matching the existing deliberate design).
