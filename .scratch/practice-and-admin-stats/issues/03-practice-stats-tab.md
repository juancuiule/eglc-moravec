# 03: Show Practice stats as a separate tab in the Stats screen

**What to build:** The existing Stats screen gains a Level/Practice tab toggle. The Practice tab shows the same shape of per-category view (`computeStats`-style: effectiveness, average time) as Level's, but computed entirely from the new Practice trial history — never blended with Level numbers.

**Blocked by:** 02

**Status:** ready-for-agent

- [x] `StatsScreen` has a Level/Practice toggle; Level tab behavior is unchanged from today.
- [x] The Practice tab aggregates only Practice trial history (ticket 02's storage), using the same aggregation shape already used for Level (reuse `computeStats` over the Practice trial list, or an equivalent — the two must never share or merge data).
- [x] Categories with zero Practice attempts show the same "no data yet" treatment the Level tab already uses.
- [x] Verified live: practice a category, stop the session, open Stats → Practice tab, see it reflected there; Level tab is untouched by Practice activity.
