# 02: The Api object — single point of definition for backend calls

**What to build:** A single, importable `Api` object is the one place every call to the backend is defined, covering every endpoint the frontend currently calls (OTP request/verify, session check, logout, results sync, level-stats pull, admin stats). Nothing consumes it yet — this is a prefactor, verified through its own tests.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] `Api` exposes one raw async function per backend endpoint currently called by the frontend (OTP request, OTP verify, session check, logout, results-sync push, level-stats pull, admin-stats fetch), ported from the existing scattered fetch call sites in `apps/frontend`.
- [ ] Each function is a plain async function, not a hook — callable directly (for server-side/non-component use) and equally usable as a `useQuery`/`useMutation` `queryFn`/`mutationFn`.
- [ ] Covered by unit tests (mocked fetch) for both the success and failure path of each call.
- [ ] Nothing in the new app calls `Api` yet — this ticket has no user-visible behavior.
