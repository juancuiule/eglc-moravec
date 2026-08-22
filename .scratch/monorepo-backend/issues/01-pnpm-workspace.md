# 01: Restructure into a pnpm workspace (apps/frontend)

**What to build:** Move the existing app into `apps/frontend` under a new `pnpm-workspace.yaml` at the repo root, with no behavior change. This is a prefactor — it makes room for `apps/backend` (ticket 02) without touching any game logic.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [x] `src/`, `index.html`, `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `LEVELS.ts` and the rest of the current app move into `apps/frontend/`, unchanged in content.
- [x] Root `pnpm-workspace.yaml` lists `apps/*`.
- [x] `pnpm --filter frontend dev`, `pnpm --filter frontend build`, and `pnpm --filter frontend test` (or equivalent root-level scripts) all work exactly as `npm run dev` / `build` / `test` do today.
- [x] All existing frontend tests still pass; `tsc --noEmit` is still clean.
- [x] No Turborepo/Nx — plain pnpm workspace only (per the monorepo-backend grilling session).
