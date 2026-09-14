# Data gaps vs. the paper

What [Zimmerman et al. 2016](https://doi.org/10.1371/journal.pone.0168431) uses that the current `apps/backend` schema doesn't collect, so future analysis work doesn't rediscover these the hard way.

## Demographics (paper Section 4)

The paper's participant table breaks results down by age, gender, and education. The backend's `users` table only has `email_hash`, `created_at`, `is_anonymous` — no demographic fields exist anywhere, so no demographic breakdown or replication of that table is possible with the current schema. Adding it would mean asking players for information the game currently never needs, a real product trade-off, not just a missing column.

## Digit-erase / edit signal

The paper excludes trials "in which participants erased a digit" from the RT analysis, on the theory that a correction mid-entry doesn't reflect a clean calculation time. `trial_results` only stores the final submitted `answer` and total `time_taken` — no keystroke or edit history — so that exclusion can't be reproduced here. `features.filter_rt_outliers` (the 4-SD-from-category-mean rule) is the only RT exclusion this dataset can support.

## What this means for the notebooks

Every effect notebook applies `filter_rt_outliers` as its only cleaning step and calls out in its own markdown where its result should be read as an approximation of the paper's rather than a strict replication. If per-keystroke timing or a digit-erase signal is ever added to the sync payload, this gap — and the resulting notebook caveats — goes away.
