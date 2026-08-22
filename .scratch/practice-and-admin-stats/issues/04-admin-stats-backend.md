# 04: Backend admin stats endpoint (per-level + per-category)

**What to build:** An unauthenticated admin route aggregating `trial_results` across every User — the honest "how hard is this, really" signal (every attempt, not just best runs) — grouped by level and, separately, by operation category.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] A deliberately separate admin module (not quietly added to `sync/`, per the architecture review — this route breaks the per-user-scoping convention every other route follows, so it should read as visibly different) exposes:
  - Per-level aggregates: `level_number`, average correctness, average time (in-time-correct only), attempt count, distinct user count.
  - Per-category aggregates: same shape, grouped by `categoryCodename` instead (already encodes operand digit counts, e.g. `2dx1d`).
- [ ] No authentication — matches the current deploy reality (not publicly exposed yet).
- [ ] An index on `trial_results(level_number)` is added so the by-level aggregate doesn't force a full table scan as data grows.
- [ ] Tests cover both aggregations against a seeded multi-user `trial_results` table (correctness math, average time excluding timed-out/incorrect trials, count fields).
- [ ] Verified via `curl` against a running instance with more than one User's data present.
