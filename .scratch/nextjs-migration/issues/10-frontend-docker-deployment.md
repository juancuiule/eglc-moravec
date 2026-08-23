# 10: Frontend Docker deployment

**What to build:** The new frontend app can be deployed the same self-hosted way the backend already is — built and run via Docker, reachable the same way.

**Blocked by:** 07, 08, 09

**Status:** ready-for-agent

- [ ] A Dockerfile builds the new frontend app for production and runs it via a Node server (supporting the `/admin` route's server-side rendering).
- [ ] A `docker-compose.yml` service runs the new frontend alongside the existing backend service.
- [ ] Verified live: `docker compose up --build` serves the app, reachable the same way the backend already is (including from another device on the local network, matching the existing `raspberrypi.local` reachability requirement).
