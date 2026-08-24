# 02: Fall back to the locally-replicated Level when the backend is unreachable

**What to build:** Change the Level page so a live-fetch failure (a mid-session network hiccup, a backend restart) no longer crashes the page. Instead, it falls back to reading that Level's data from the locally-replicated catalog (see ticket 01) and play continues normally. If the local copy is also unavailable — a Level never previously replicated on this device — the player sees a clear empty/error state instead of a crash. Whenever the fallback path is used, a clear, visible warning is logged so the fallback is observable and debuggable, never silently indistinguishable from the normal path. The existing behavior for a Level number that genuinely doesn't exist (a real 404, returned when the backend is reachable) is unchanged — this ticket only changes what happens when the backend is unreachable, not when it correctly says a Level doesn't exist.

**Blocked by:** 01 (Set up RxDB and locally replicate the Level catalog)

**Status:** ready-for-agent

- [ ] Starting a previously-visited Level while the backend is unreachable no longer crashes the page — the Level loads and is playable using the locally-replicated copy.
- [ ] A clear console warning is logged whenever the local fallback is used, distinguishing this path from a normal successful fetch.
- [ ] Starting a Level that has never been replicated locally, while the backend is unreachable, shows a clear empty/error state instead of crashing.
- [ ] Visiting a Level number that does not exist, while the backend is reachable, still 404s exactly as it does today — unchanged.
- [ ] Automated tests cover: a normal successful fetch, a fetch failure with a local copy available, a fetch failure with no local copy, and the console-warning behavior.
