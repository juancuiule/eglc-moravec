# backend

Fastify + SQLite (`node:sqlite`, no native dependency). Deployed self-hosted via Docker. Depends on the shared `packages/engine` domain model to independently re-validate client-submitted trials — see `docs/adr/` for the history: ADR-0001 named the trigger for extracting `engine`, ADR-0002 (superseded by ADR-0005) originally deferred server-side re-validation.

## Local dev

```sh
pnpm --filter backend dev    # tsx watch, http://localhost:3000
pnpm --filter backend test   # vitest
```

## Deploy (manual)

First time only: `cp apps/backend/.env.example apps/backend/.env` and fill in `EMAIL_HASH_SECRET` (a long random string) and `RESEND_API_KEY`. `docker-compose.yml` reads this file — without it, `docker compose up` fails to find it, and without `EMAIL_HASH_SECRET` specifically, the server refuses to start in production (see `src/config.ts`).

On the target host (Raspberry Pi today, a DO VPS later):

```sh
ssh <host>
cd moravec               # existing clone of this repo
git pull
docker compose up --build -d
curl http://localhost:3000/health   # {"status":"ok","db":true}
```

The SQLite file lives in the `moravec-data` Docker volume (mounted at `/app/data`), so it survives container restarts and rebuilds. No CI/CD and no automated DB backup yet — both are deliberately deferred (see the monorepo-backend planning notes in `.scratch/`).
