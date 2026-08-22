# 01: Extract a shared trial engine behind game/practice policy adapters

**What to build:** `game/index.ts` and `practice/index.ts` both drive answer-scoring, timeout-scoring, and hint-visibility through one shared trial-engine module instead of duplicated logic. Player-visible behavior (scoring, timing, hint budget rules) is unchanged.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [x] A `src/trial/engine.ts` module exports the answer-scoring and timeout-scoring logic (`timeTaken`, `correct`, `timeExceeded` computation) as pure functions, plus the `Keystroke` and `Answering` types currently defined in `game/index.ts` and cross-imported by `practice/index.ts`.
- [x] `game/index.ts`'s `submitAnswer`/`timeUp` call the shared engine functions instead of duplicating the timing/correctness math inline.
- [x] `practice/index.ts`'s `submitAnswer`/`timeUp` call the same shared engine functions.
- [x] `practice/index.ts` imports `Keystroke`/`Answering` from the new trial module instead of from `../game/index`.
- [x] The hint-visibility guard ("can a hint be shown right now") is a shared pure predicate, parameterized by an optional hint budget so the level game's finite budget and practice's unlimited hints both use it.
- [x] `game/index.test.ts` and `practice/index.test.ts` pass unmodified (or with only import-path updates), proving behavior is unchanged.
- [x] New unit tests for the trial-engine module cover answer scoring, timeout scoring, and the hint-visibility predicate directly.
