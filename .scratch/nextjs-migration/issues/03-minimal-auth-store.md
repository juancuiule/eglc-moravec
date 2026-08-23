# 03: Minimal auth (session) store

**What to build:** A minimal, persisted notion of "is someone logged in, and with what token" exists and is readable both from React components and from non-component code, matching the shape and external-readability of the existing `apps/frontend` auth store, but slimmed to just the session result — the login flow's own step-tracking and submitting/error state do NOT live here (see ticket 05).

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] A store holds exactly two states: logged out, or logged in with a token and email.
- [ ] The logged-in session persists across a page reload (localStorage-backed, matching the existing app's approach).
- [ ] On boot, an existing persisted session is validated against the backend via `Api`'s session-check call; an invalid/expired session is cleared.
- [ ] Logging out clears the persisted session and calls `Api`'s logout endpoint.
- [ ] The store's current state is readable synchronously from outside a React component (not just via a hook) — non-component code elsewhere in the app (see ticket 07) needs to read "is there a logged-in token" imperatively.
