# 01: Set up RxDB and locally replicate the Level catalog

**What to build:** Add RxDB, on the free tier only, as a typed local database running in the browser. Define a schema and collection for the Level catalog (each Level's number and its mix of Operation categories) and wire pull-only replication so the collection populates automatically from the existing, already-public Level catalog endpoints once the app has loaded — no user action required. Replication retries automatically after a failed pull (e.g. on reconnect). No push handler or conflict resolution is needed here: this is read-only, server-authoritative reference data, not something the client ever writes to.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] RxDB is added as a dependency, on the free tier only — no Premium features required.
- [ ] A typed Level collection exists, schema-validated, populated via pull replication from the existing Level catalog endpoints.
- [ ] Replication starts automatically on app load and retries after a failed pull (e.g. reconnect after the backend was briefly unreachable).
- [ ] After a normal app visit, the collection can be verified locally (e.g. via browser devtools IndexedDB inspection) to contain every known Level.
- [ ] Automated tests cover the collection's schema and the replication logic, using RxDB's free in-memory storage adapter (matches this project's existing test environment — no real browser IndexedDB needed).
- [ ] No backend changes are required or made — the existing Level catalog endpoints are consumed exactly as they are today.
