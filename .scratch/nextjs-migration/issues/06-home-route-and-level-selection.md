# 06: Home route and level selection

**What to build:** Visiting `/` shows the level selection screen (matching today's), with real navigation (not simulated) to the Stats, Practice, and Login screens.

**Blocked by:** 01, 03

**Status:** ready-for-agent

- [ ] `/` renders the level-selection screen, showing local level records exactly as today.
- [ ] Navigating to Stats, Practice, or Login uses real links/URL navigation to `/stats`, `/practice`, `/login` respectively — not simulated in-memory nav state.
- [ ] The screen reflects the ticket-03 auth store's logged-in/logged-out state wherever the current app does.
