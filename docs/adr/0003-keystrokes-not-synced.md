# Keep keystroke traces client-only; don't sync them to the backend

Every Trial captures a full keystroke trace (`TrialResult.keystrokes`) and stores it locally, but `sync/push.ts` deliberately reshapes each trial before sending it to the backend, dropping `keystrokes` from the payload — `apps/backend`'s `trial_results` table has no column for it. Nothing server-side reads keystroke data today, so plumbing it through would be speculative infrastructure: new schema, more bytes over the wire, for a consumer that doesn't exist.

This is deliberate, not an oversight. Keystroke traces are exactly the kind of signal a future anti-cheat pass would want (see ADR-0002 — v1 trusts client-submitted results). If that trigger is ever pulled, wiring keystrokes into the sync payload and schema is the natural first step, but it isn't worth doing ahead of that need.
