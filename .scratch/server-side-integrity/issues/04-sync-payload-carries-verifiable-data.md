# 04: Sync payload carries enough to independently verify a trial

**What to build:** The sync payload for a finished Level's trials includes each trial's actual operands (enough to reconstruct the `Operation` it was) and the submitted answer, not just the client's `correct`/`timeExceeded` claim. This is prep — nothing consumes this data server-side yet (that's ticket 05).

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] `Operation` (in `packages/engine`) exposes a way to get its raw operand values in a serializable form, alongside its existing `categoryCodename()`/`result()`/`solveTime()` methods.
- [ ] The data synced for each trial includes: operation type + operands (or an equivalent reconstructable representation), the submitted answer, and the existing timing fields — sent alongside, not instead of, what's already synced.
- [ ] Local storage (`PersistedTrial`, `storage/trialHistory.ts`) is unaffected — this is purely about what crosses the wire to the backend, not what's kept on-device. Avoid recomputing the trial-to-payload mapping a second time independently of the existing local-storage mapping (that duplication was deliberately removed earlier this session because it caused divergent timestamps — don't reintroduce a similar split).
- [ ] No behavior change yet: the backend still stores and trusts the client's `correct`/`timeExceeded` claim exactly as before. This ticket only makes the additional data available.
