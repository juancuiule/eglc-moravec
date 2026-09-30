# Data gaps vs. the paper

What [Zimmerman et al. 2016](https://doi.org/10.1371/journal.pone.0168431) uses that the current `apps/backend` schema doesn't collect, so future analysis work doesn't rediscover these the hard way.

## Demographics (paper Section 4)

The paper's participant table breaks results down by age, gender, and education. The backend's `users` table only has `email_hash`, `created_at`, `is_anonymous` — no demographic fields exist anywhere, so no demographic breakdown or replication of that table is possible with the current schema. Adding it would mean asking players for information the game currently never needs, a real product trade-off, not just a missing column.

## Digit-erase / edit signal

**Now bridged for new data** (#68): `trial_results.keystrokes` stores the per-trial `{key, t}` trace verbatim (JSON, NULL for anything synced before the column existed), and `features.add_keystroke_fields` derives `erased_digit` — `None` when the trace is absent (pre-#68 rows: unknown, not clean), so `df[df["erased_digit"] == False]` selects only observed-clean trials. The trace is **server-side storage only** — never returned by sync pulls — so the only local copy lives in the recording device's outbox row.

## What this means for the notebooks

Every effect notebook applies `filter_rt_outliers` as its only cleaning step and calls out in its own markdown where its result should be read as an approximation of the paper's rather than a strict replication. For post-#68 data the erased-digit exclusion is also available (`erased_digit` above) — the approximation caveat only stands for the pre-column rows.
