# 02: Scaffold apps/backend (Fastify + SQLite) with a health check, running in Docker

**What to build:** A runnable, empty-but-real backend package that can be deployed to the Raspberry Pi (and later a DO VPS) via Docker. No game or auth logic yet — just the skeleton and the deploy path proven end-to-end.

**Blocked by:** 01 (needs the workspace to exist to add a second package cleanly)

**Status:** ready-for-agent

- [x] `apps/backend` package: Fastify server, SQLite connection (file-based, path configurable via env var), one `GET /health` endpoint returning 200.
- [x] `Dockerfile` for the backend package and a `docker-compose.yml` (at repo root or in `apps/backend`) that mounts a volume for the SQLite file so data survives container restarts.
- [x] Manual deploy path documented and verified: `ssh` into the target host, `git pull`, `docker compose up --build -d`.
- [x] Verified running via `docker compose up` (locally, or on the Pi) and `curl http://<host>/health` returns 200.
- [x] No CI/CD pipeline — manual deploy only (per the grilling session).
