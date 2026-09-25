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

nginx fronts both `backend` and `frontend` internally (`/` → frontend, `/api/*` → backend, prefix stripped). No service publishes a host port. The public app lives at `https://moravec.elgatoylacaja.com`, reached via Cloudflare → cloudflared → nginx → Fastify. See root `infra/nginx/default.conf` for the proxy config.

### Client-IP trust and OTP limits

Compose isolates each proxy link. Only nginx and backend join `backend_proxy` (`172.30.60.0/29`); Fastify trusts nginx's fixed `172.30.60.2` address, and only at the socket hop. Only cloudflared and nginx join `tunnel_ingress` (`172.30.60.8/29`); nginx accepts `CF-Connecting-IP` only from cloudflared's fixed `172.30.60.10` address. nginx replaces `X-Forwarded-For` with that parsed client address, falling back to the socket peer when the Cloudflare header is absent, and strips `CF-Connecting-IP` upstream. Other ingress peers are denied, except loopback for the healthcheck.

The frontend reaches backend over a separate internal network, where forwarded headers are not trusted. Backend has its own egress network for Resend. Every container drops `NET_RAW` to prevent raw-packet/ARP spoofing by sibling services. The Docker host, daemon administrators, nginx, and cloudflared remain trusted; do not attach other containers to the proxy networks, grant network capabilities, or publish nginx/backend ports. Check that both fixed subnets are unused on the host before deployment. If they conflict, update Compose, nginx's connector allowlist, and `TRUSTED_PROXY_IP` together; never broaden the allowlist to a subnet or all proxies.

Outside Compose, `TRUSTED_PROXY_IP` defaults to blank (trust disabled), so local development uses the socket IP even when forwarding headers are supplied. An override must be a single nginx IP address, not a CIDR, hop count, or hostname.

OTP requests allow 10 requests per IP (IPv6 /64) per 10 minutes, including malformed requests and per-email cooldown failures. The existing 30-second email cooldown remains. A separate global bucket allows 100 send attempts per hour, charged only after validation and OTP reservation. Failed provider calls count; global denials do not extend the window or retain the reservation. All three denial paths return `429`, `rate_limited`, `Retry-After`, and `X-RateLimit-Limit/Remaining/Reset` headers for the rejecting policy, with reset values in seconds.

Override the defaults with `OTP_IP_RATE_LIMIT_MAX`, `OTP_IP_RATE_LIMIT_WINDOW_MS`, `OTP_GLOBAL_RATE_LIMIT_MAX`, and `OTP_GLOBAL_RATE_LIMIT_WINDOW_MS` in the backend environment. Each must be a positive safe integer; blank or invalid values fail startup. Buckets are in memory for this single backend instance and reset on restart. Do not scale backend replicas without a shared limiter store.

Logs omit recipients, email hashes, codes, client IPs, request query values, and provider response bodies. nginx access logs contain only method, status, and duration; its request error log is disabled because nginx includes client addresses there. Without `RESEND_API_KEY`, development skips email delivery without logging the code.

The SQLite file lives in the `moravec-data` Docker volume (mounted at `/app/data`), so it survives container restarts and rebuilds. No CI/CD and no automated DB backup yet — both are deliberately deferred.
