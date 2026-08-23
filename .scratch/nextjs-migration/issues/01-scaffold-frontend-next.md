# 01: Scaffold apps/frontend-next

**What to build:** A new, empty, fully-working Next.js App Router workspace package exists alongside the current Vite frontend, provably buildable/testable/runnable, with nothing migrated into it yet.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] A new `apps/frontend-next` workspace package exists (Next.js App Router, TypeScript, Tailwind, matching the visual style already established in `apps/frontend`), added to the root `pnpm-workspace.yaml`.
- [ ] `packages/engine` is wired in as a workspace dependency, matching how `apps/frontend` already consumes it.
- [ ] Vitest is configured for this package (logic/component tests), matching the monorepo's existing testing conventions.
- [ ] A single trivial route renders successfully.
- [ ] Verified live: dev server boots, `typecheck`/`test:run`/`build` all pass.
