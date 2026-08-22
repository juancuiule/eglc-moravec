# 01: Extract packages/engine (pure move, no behavior change)

**What to build:** `operations/`, `trial/engine.ts`, and `starsForScore`/`LEVEL_COMPLETE_THRESHOLD` (currently in `game/index.ts`) move into a new shared workspace package, `packages/engine`. `apps/frontend` imports them from there instead of from local `src/` paths. This is the extraction ADR-0001 named as its trigger condition — the backend now needs this logic, so the deferred package split happens for real.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] `packages/engine` exists as a proper workspace package (its own `package.json`, `tsconfig.json`, included in the root `pnpm-workspace.yaml`).
- [ ] `operations/` (the full domain model: `Operation`, `Addition`, `Multiplication`, `Squaring`, hints, category, operand) and `trial/engine.ts` (`scoreAnswer`, `scoreTimeout`, `canShowHint`) move there unchanged in content.
- [ ] `starsForScore` and `LEVEL_COMPLETE_THRESHOLD` move from `game/index.ts` into the engine package alongside the rest of the scoring logic they belong with.
- [ ] `apps/frontend` depends on `packages/engine` and imports all of the above from it; no duplicated copies remain in `apps/frontend/src`.
- [ ] All existing tests (the moved engine tests, and everything in `apps/frontend` that depends on this logic) pass unchanged — this ticket changes where code lives, not what it does.
- [ ] `apps/backend` is untouched by this ticket (nothing to import yet — that's ticket 04/05).
