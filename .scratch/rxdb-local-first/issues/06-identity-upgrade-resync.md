# 06: Keep replication correct across the anonymous-to-real identity upgrade

**What to build:** `verifyOtp()` issues a brand new session token when an anonymous identity upgrades to a real, email-verified one — the old anonymous token stops being used going forward. Any replication handler that captured a token once at replication-start, instead of reading the current one fresh on every call, would keep syncing against a now-stale identity after an upgrade happens mid-session. Make the Trial-results push handler (ticket 04) and the Level-stats pull handler (ticket 05) both read the current token from the auth store at call time, the same way every other `Api` call already does (never cached).

The backend's one-time re-key merge (`mergeAnonymousIdentity`, `apps/backend/src/sync/repo.ts`) stays exactly as it is — it's a database-internal operation, orthogonal to how the client happens to sync, and needs no change. The piece this ticket actually adds: right after a successful login (an upgrade, or a fresh login on a new device), force an immediate Level-stats pull refresh instead of waiting for the next periodic/reconnect-triggered one, so the account's merged history is visible right away rather than eventually.

**Blocked by:** 04 (Trial-results push replication), 05 (Level-stats pull replication)

**Status:** ready-for-agent

- [ ] Trial-results pushed by an anonymous session that then upgrades mid-flight land under the correct (now-real) identity, not the discarded anonymous one.
- [ ] Level-stats pulled right after logging in (upgrade or fresh login) reflect the account's merged history immediately, not after some later, unrelated sync cycle.
- [ ] The backend's existing anonymous-identity-merge behavior and its tests are unaffected.
