# 07: Level gameplay

**What to build:** A player can select and fully play a Level under `/` — answering trials, seeing hints, finishing the level, seeing their result — with local persistence and (when logged in) the same backend sync as today, byte-for-byte the same gameplay behavior as the current app.

**Blocked by:** 06

**Status:** ready-for-agent

- [ ] The Level gameplay state machine (Playing/Reviewing/Finished, hints, keystroke capture, timing) behaves identically to the current app — ported without behavior changes.
- [ ] Finishing a Level updates the local level record and trial history exactly as today.
- [ ] When logged in, finishing a Level pushes results to the backend exactly as today (fire-and-forget, calling `Api`'s results-sync function directly, not through TanStack Query), triggered by the same state-transition-driven approach the current app uses (not a component-rendered loading state).
- [ ] Verified live: play a full level against the real running backend while logged in; confirm the sync lands server-side.
