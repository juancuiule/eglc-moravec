# backend

Fastify + SQLite (`node:sqlite`, no native dependency). Deployed self-hosted via Docker. Depends on the shared `packages/engine` domain model to independently re-validate client-submitted trials — see `CONTEXT.md`'s "backend independently re-validates trial correctness" entry.

## Local dev

```sh
pnpm --filter backend dev    # tsx watch, http://localhost:3000
pnpm --filter backend test   # vitest
```

## Deploy (manual)

First time only: `cp apps/backend/.env.example apps/backend/.env` and fill in `HASH_SECRET` (a long random string) and `RESEND_API_KEY`. `docker-compose.yml` reads this file — without it, `docker compose up` fails to find it, and without `HASH_SECRET` specifically, the server refuses to start in production (see `src/config.ts`).

Also first time only, at the repo root: `cp .env.example .env` and fill in `CLOUDFLARE_TUNNEL_TOKEN` (from the tunnel's Public Hostname config in the Cloudflare Zero Trust dashboard — see root `docker-compose.yml`'s `cloudflared` service).

On the target host (a Raspberry Pi today, running `docker compose` directly — no ssh/remote deploy step, this repo _is_ checked out on the host):

```sh
cd moravec               # existing clone of this repo
git pull
docker compose up --build -d
docker compose ps        # all services healthy
```

nginx fronts both `backend` and `frontend` internally (`/` → frontend, `/api/*` → backend, prefix stripped) and is only reachable from `cloudflared` over the compose network — nothing but `cloudflared` needs a host port. The public app lives at `https://moravec.elgatoylacaja.com`, reached via a Cloudflare Tunnel (no port-forwarding on the router). See root `infra/nginx/default.conf` for the proxy config.

The SQLite file lives in the `moravec-data` Docker volume (mounted at `/app/data`), so it survives container restarts and rebuilds. No CI/CD and no automated DB backup yet — both are deliberately deferred.
