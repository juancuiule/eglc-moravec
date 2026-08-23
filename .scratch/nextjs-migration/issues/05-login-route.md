# 05: Login route

**What to build:** Visiting `/login` lets a player request and verify an OTP code and become logged in, with the same email → code → logged-in flow as today, and a successful login pulls down and merges the player's remote level stats exactly as it does today.

**Blocked by:** 02, 03

**Status:** ready-for-agent

- [ ] `/login` is a client component managing its own local flow-state (entering email → entering code) and its own pending/error state via `useMutation` wrapping `Api`'s OTP request/verify calls — none of this lives in a global store.
- [ ] A successful verify writes the resulting session into the ticket-03 auth store.
- [ ] A successful login triggers a pull-and-merge of the player's remote level stats into local storage, calling `Api`'s level-stats-pull function directly (not through TanStack Query) — matching the current app's background sync-on-login behavior.
- [ ] Verified live: requesting and verifying a real OTP against the real running backend logs the player in and persists the session across a reload.
