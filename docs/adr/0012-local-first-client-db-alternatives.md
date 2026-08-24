# Local-first client database alternatives to Jazz.tools

ADR-0011 evaluated Jazz.tools against this app's real sync needs and concluded "still too soon" — not because local-first client storage is a bad idea, but because Jazz itself is split into a maintained-but-being-phased-out "classic" product and a v2 that calls itself ["alpha-quality software"](https://jazz.tools/blog/what-is-jazz) in its own launch post. This document reuses ADR-0011's app-context and evaluation dimensions and asks the same questions of three other candidates — RxDB, Triplit, and PowerSync — plus a lighter look at TinyBase, so the underlying idea (replace `apps/frontend/src/storage/trialHistory.ts` and `levelStats.ts`'s ad hoc `localStorage` JSON blobs with a fully-typed local-first client database that background-syncs to the backend) isn't dropped just because Jazz specifically was rejected.

The constraints carried over from ADR-0011, restated for reference:

- **Server-side re-validation of trial correctness is a hard requirement.** `apps/backend/src/sync/logic.ts` independently recomputes correctness from raw operands/answer/`timeTaken` using `packages/engine`'s scoring rules today, and any replacement must preserve that — a merged CRDT/sync state can never be treated as automatically authoritative.
- **Anonymous device identity that later upgrades/merges into a real verified account.**
- **Self-hosted via Docker Compose on a home LAN device** (e.g. a Raspberry Pi) — single-maintainer app, no platform team, no dependency on a hosted SaaS sync service being required.
- **Current backend is Fastify + SQLite**, not Postgres/MySQL — a candidate that forces a migration off SQLite is a materially bigger ask than one that doesn't.
- **Data shape is append-only history + derived best-record** (trial results and level runs are never overwritten; `LevelStats` is a "better record wins" cache, never itself a source of truth).
- **Practice sessions are local-only today, never synced.**

## Recommendation

**RxDB is the strongest fit of the three, and — unlike Jazz — it is not blocked by a production-readiness objection.** It's a real, multi-year, Apache-2.0-licensed project (23.4k GitHub stars, [`pubkey/rxdb`](https://github.com/pubkey/rxdb)) with production users at real companies ([rxdb.info](https://rxdb.info/) testimonials from SafeEx, WooCommerce POS, myAgro, Nutrien), and — most importantly for blast radius — it deliberately does **not** try to be the backend. It ships a replication *protocol* (checkpoint-based pull, conflict-array push) that you implement against your own REST endpoints, so `apps/backend/src/sync/logic.ts`'s existing "independently recompute correctness, never trust the client" logic doesn't get replaced — it gets reshaped into the push handler's conflict-detection response. Fastify + SQLite stay exactly as they are. The free, Apache-2.0 tier genuinely covers what this app needs on the frontend (Dexie.js/IndexedDB storage, replication, schema validation, up to 13 collections open in parallel) — it does not require paying for RxDB Premium to get a working browser-side store.

That said, this is not a "go implement it this sprint" verdict. RxDB clearing the bar means it is *safe to pilot when there is a concrete product driver* (e.g. a real request for offline play with cross-device reconciliation) — the same framing ADR-0011 used for its trigger condition. Nothing here changes the fact, noted in `CONTEXT.md`, that this app doesn't yet have a product need beyond "would be nice." If and when that need shows up, RxDB — not Jazz, not Triplit, not PowerSync — is the one to reach for first.

**Ranking: RxDB > Triplit > PowerSync**, for this app specifically:

1. **RxDB** — smallest blast radius (zero backend migration), real production track record, free tier covers the actual need, re-validation is a natural fit for a pattern this app already implements. Its weakest point is a JSON-Schema-first typing story rather than Triplit's TypeScript-native one, and several storage adapters (SQLite, OPFS, native IndexedDB, the official Fastify server adapter) are Premium-only — but the free Dexie.js storage adapter is sufficient for a browser client.
2. **Triplit** — the most Jazz-like in ambition (full-stack typed sync, closest to what Jazz was attempting) and the best TypeScript-native schema story of the three, but weakest on the two load-bearing requirements: field-level write restriction (needed to stop a client from setting its own `correct`/`time_exceeded`) was only "coming soon" as of a mid-2024 release note with no confirmation found that it has since shipped, and there is no documented anonymous-to-real identity upgrade pattern the way Jazz v2 has one. Small team (3-person YC company), AGPL-3.0 core.
3. **PowerSync** — architecturally the *closest* built-in match to this app's re-validation model (synchronous `uploadData()`, explicit accept/reject-and-revert semantics), and its relational-SQL-as-source-of-truth model is arguably the cleanest fit for the append-only + derived-best-record shape of the three. It ranks last anyway because it fails the deployment-shape constraint hardest: PowerSync flatly does not support SQLite as a source database (Postgres, MongoDB, MySQL-Beta, SQL Server-Beta, Convex-Experimental only, per [docs.powersync.com](https://docs.powersync.com/)), and self-hosting the PowerSync Service itself requires a *second* piece of infrastructure — MongoDB or Postgres for its own internal "bucket storage" — on top of that. Adopting PowerSync here means migrating the backend off SQLite **and** running an extra service **and** an extra storage database on a Raspberry Pi, for a project that only set out to replace client-side `localStorage` blobs.

---

## RxDB

### Maturity / production-readiness, in RxDB's own words

RxDB is at v17.2.0 as of this research (measured live via [Bundlephobia](https://bundlephobia.com/package/rxdb)), Apache-2.0 licensed, 23.4k GitHub stars, 1.2k forks ([pubkey/rxdb](https://github.com/pubkey/rxdb)). The README describes it as **"a proven technology used by thousands of developers worldwide"** with a **"battle-tested Sync Engine."** The [homepage](https://rxdb.info/) lists production users spanning inspection software (SafeEx), point-of-sale (WooCommerce POS), and agriculture (myAgro, Nutrien) — a materially longer and broader production track record than either Jazz product had in ADR-0011.

### Fit for server-side re-validation

This is the load-bearing question, and RxDB's answer is structural: **it doesn't ship a backend at all** — the [replication protocol](https://rxdb.info/replication.html) is something you implement against your own server. The protocol is checkpoint-based: the client's `pullHandler` receives the last checkpoint and returns documents written after it; the `pushHandler` receives `assumedMasterState`/`newForkState` pairs and **"must return an array that contains the master document states of all conflicts."** Concretely: *"If the master state is equal to the latest master state of the client, the new client state is set as the latest master state. If the master also had changes... we have a conflict that has to be resolved on the client."*

Mapped onto this app: the client's push handler POSTs raw operands/answer/`timeTaken` plus its own claimed correctness to (a redesigned) `/sync/results`; the Fastify handler independently recomputes correctness via `packages/engine`, exactly as `apps/backend/src/sync/logic.ts` does today; if the client's claim matches, the write is accepted as-is; if it doesn't, the backend returns the *server-recomputed* document in the conflicts array, which forces the client's [conflict handler](https://rxdb.info/transactions-conflicts-revisions.html) to resolve to the master state — **"The default conflict handler will always drop the fork state and use the master state instead."** Custom conflict handlers are fully supported (*"In your custom conflict handler you likely want to merge properties of the realMasterState and the newDocumentState"*), so app-specific logic like "higher score wins" can live there too. This isn't a workaround — it's RxDB deliberately not having an opinion about backend authority, which is exactly what this app needs.

### Self-hosting story

Not applicable in the usual sense — there is no RxDB sync server to self-host. The sync endpoint is just more Fastify route handlers next to the ones that already exist, running in the same Docker Compose container as today. This is the lightest possible self-hosting story of the three candidates, because there's nothing new to host.

### Anonymous-to-real identity upgrade

RxDB has no opinion here either — it's a client storage + replication library, not an identity system. Whatever this app already has (or plans, per the now-folded ADR-0009 design) for anonymous-to-real account merging continues to apply unchanged; RxDB doesn't help or hinder it.

### Fit for append-only + derived-best-record shape

Append-only writes (trial results, level runs) map cleanly onto RxDB's `upsert(table, data, { id })` keyed by a client-generated id — the same dedup pattern this app's backend already does via `INSERT OR IGNORE` on a client-generated UUID. RxDB is explicit that it does **not** do domain-aware merging on your behalf — the "more stars, or same stars + less time" `LevelStats` comparison in `apps/frontend/src/storage/levelStats.ts` would still be hand-written application logic inside a custom conflict handler, same as it is today. That's not a mark against RxDB specifically — no candidate researched here does this automatically.

### Blast radius

- `trialHistory.ts` / `levelStats.ts` — replaced by RxDB collections backed by the free Dexie.js (IndexedDB) storage adapter.
- `pushResults.ts` — reshaped into an RxDB replication push handler; RxDB's built-in retry-on-reconnect closes the gap this file's current fire-and-forget `POST` doesn't cover.
- `apps/backend/src/routes/sync.ts` / `sync/logic.ts` — endpoints get reshaped to RxDB's pull/push/checkpoint contract, but **the tables, the database, and the re-validation logic itself stay** — this is a reshaping of existing code, not a replacement of the backend architecture the way Jazz or Triplit would be.
- Practice sessions — trivially preserved as local-only: simply don't attach a replication handler to that collection, the same way practice data is excluded from the sync payload today.

### Licensing — precise, not guessed

RxDB core is Apache 2.0 and free forever ([rxdb.info/premium/](https://rxdb.info/premium/)): schemas, queries, hooks, replication & realtime sync, schema validation & migration, and the **Dexie.js, Memory, LocalStorage, Remote, Electron Ipc, MongoDB, DenoKV, and FoundationDB** storage adapters, plus up to 13 open collections in parallel. **RxDB Premium**, from $99/month billed annually (Pro tier), adds the **native IndexedDB, OPFS, and SQLite** `RxStorage` adapters, Node/Expo filesystem storage, WebCrypto encryption, and full-text search; Pro Plus ($239/mo) adds Worker/SharedWorker storage, sharding, memory-mapped storage, a query optimizer, and — notably for this stack — **the official Fastify and Koa `RxServer` adapters** ([rxdb.info/premium/](https://rxdb.info/premium/), [rx-storage.html](https://rxdb.info/rx-storage.html)). For this app: the frontend can run entirely on the free tier using the Dexie.js storage adapter (still IndexedDB-backed under the hood); the official RxDB-Fastify integration and native SQLite storage require a paid plan, but neither is required — a hand-written Fastify route achieves the same push/pull contract for free.

### TypeScript schema story

RxDB schemas are [JSON Schema](https://rxdb.info/), not TypeScript-native: *"RxDB uses JSON Schema, a format widely recognized by developers through tools like OpenAPI or Swagger."* TypeScript types are then derived from the JSON Schema rather than written as native TS the way Triplit's `S.Schema()` works — a real, if secondary, disadvantage against Triplit specifically.

### Bundle size and rough edges

Core `rxdb` v17.2.0 measures **50,203 bytes gzip / 157,192 bytes minified** on [Bundlephobia](https://bundlephobia.com/package/rxdb), with the `mingo` query engine as the largest dependency (~147KB unminified). The 13-open-collections cap on the free tier is unlikely to bind for this app (trial results, level runs, level stats, practice — well under 13) but is worth knowing about. Native storage/encryption/Fastify-adapter Premium gating means some directions this app might want to grow into later (e.g. official server-side plugin support) carry a real dollar cost.

---

## Triplit

### Maturity / production-readiness, in Triplit's own words

Triplit ([`aspen-cloud/triplit`](https://github.com/aspen-cloud/triplit)) is AGPL-3.0 licensed, 3.1k GitHub stars, 102 forks. It's a Y Combinator W21 company — a **3-person team**, founded 2020 ([ycombinator.com/companies/triplit](https://www.ycombinator.com/companies/triplit)) — a comparable bus-factor risk to the small-team dynamic ADR-0011 flagged for Jazz. `@triplit/client` is on npm at **1.0.50** ([registry.npmjs.org/@triplit/client](https://registry.npmjs.org/@triplit/client)), and the project has published a ["Triplit 1.0"](https://www.triplit.dev/blog/triplit-1.0) blog post marking that milestone — direct fetches of that post's exact self-description of stability failed repeatedly during this research (connection refused to triplit.dev on every attempt), so its precise "stable"/"production-ready" wording could not be directly quoted here; treat the 1.0 version number itself, not any specific stability claim, as the confirmed fact. The GitHub README contains **no explicit "beta"/"alpha"/"experimental" disclaimer** that this research could find, unlike Jazz v2's explicit "alpha-quality software" self-description.

### Fit for server-side re-validation

Weaker and less clearly documented than either RxDB or PowerSync. Triplit's [permissions system](https://www.triplit.dev/docs/auth) defines row-level filters per role for insert/update/postUpdate/delete (e.g. restricting a `user` role to only insert/update rows matching `['authorId', '=', '$role.userId']`) — a real, row-scoped access control mechanism. But **field-level restriction** — the specific thing needed here, so a client can insert its raw trial data but never set `correct`/`time_exceeded` itself — was only announced as "coming soon" in a [July 2024 release note](https://www.triplit.dev/blog/release-notes-2024-07-12) ("Preserve your data with permissions"), and no confirmation that it has since shipped turned up in this research. That has to be treated as an open, unverified question rather than assumed present.

Triplit does have a [webhooks](https://www.triplit.dev/blog/release-notes-2024-10-18) feature ("Hooked on Webhooks") that can notify an external service on insert/update/delete, HMAC-signed via `x-triplit-signature`/`TRIPLIT_WEBHOOK_SECRET` — a backend process could use this to observe a trial submission and write back a corrected row. But as of that release it's explicitly a **"developer preview,"** and it's asynchronous/fire-and-forget by design (notify-after-the-fact), not a synchronous accept/reject gate the way RxDB's push handler or PowerSync's `uploadData()` are. That means an unverified client-claimed correctness value could be visible to other readers (or the player themself) for a window before a webhook-driven correction lands — a meaningfully weaker guarantee than the other two candidates.

### Self-hosting story

Triplit is explicitly built for self-hosting — a [2024 blog post](https://www.triplit.dev/blog/release-notes-2024-06-14) is literally titled "Triplit is for Self-Hosting." The [self-hosting docs](https://www.triplit.dev/docs/self-hosting) (retrieved via search-engine synthesis of the live page, since direct fetches of triplit.dev were consistently refused during this research — flagged accordingly) describe deploying the Docker image `aspencloud/triplit-server:latest`, configuring `JWT_SECRET`/`LOCAL_DATABASE_URL` and other env vars, and mounting a volume for persistence; storage adapters include **SQLite and LMDB** for the server itself. This is a genuine point in Triplit's favor over PowerSync specifically: because Triplit's own server storage can be SQLite-backed, adopting it would not force this app to migrate its underlying database engine off SQLite the way PowerSync would — though, like Jazz, Triplit would still likely become the source of truth in place of the existing hand-rolled `trial_results`/`level_runs`/`level_stats` tables, not a layer in front of them.

### Anonymous-to-real identity upgrade

Triplit's [auth model](https://www.triplit.dev/docs/auth) has two built-in default roles: `anonymous` (assigned to any client connecting with the Triplit-generated "Anon token," described as safe for client-side use) and `authenticated` (assigned when the JWT carries a `sub` claim). This is a *role* distinction, not a *stable identity* — nothing found in this research documents a device-secret-based persistent anonymous identity that can later prove ownership and merge into a verified account the way Jazz v2's `local-first` auth mode does. Building that upgrade path in Triplit would mean rolling this app's own stable-anon-id JWT scheme on top (issuing a JWT with a persistent device-generated `sub` before login, then re-issuing one with the same `sub` after email verification) — doable, but bolted on, not a documented first-class Triplit pattern.

### Fit for append-only + derived-best-record shape

Schema-typed collections with a required `id` field ([schemas docs](https://www.triplit.dev/docs/schemas)) support append-only inserts cleanly. No documented built-in "better record wins" merge semantics were found; the same hand-written comparison logic this app already has would be needed regardless of candidate.

### Blast radius

Structurally similar to Jazz (ADR-0011 §5): Triplit wants to be the full-stack source of truth across client and server, so this would replace the existing SQLite tables (with Triplit's own SQLite/LMDB-backed storage, not a forced database-engine migration), replace the sync endpoints, and likely replace or subsume the auth/session layer, since Triplit's permission model needs to know the calling identity directly.

### TypeScript schema story

This is Triplit's strongest point among the three. Schemas are TypeScript-native via `S.Schema()`/`S.Collections()`, with typed `S.Id()`, `S.String()` (including enums), `S.Boolean()`, `S.Date()`, `S.Number()`, `S.Record()`, and `S.Set()` — *"The schema passed to the client constructor will be used to validate your queries and give you type hinting in any of the client's methods"* ([schemas docs](https://www.triplit.dev/docs/schemas)). This is a materially better native-TS experience than RxDB's JSON-Schema-first approach.

### Bundle size and rough edges

`@triplit/client` measures **69,324 bytes gzip / 241,871 bytes minified** on [Bundlephobia](https://bundlephobia.com/package/@triplit/client) — the largest client bundle of the three measured here. AGPL-3.0 licensing on the self-hosted server component is unlikely to be a practical problem for an internally-run, non-redistributed Docker Compose deployment, but is a copyleft license this app's other dependencies don't otherwise carry, worth noting for anyone auditing licenses later.

---

## PowerSync

### Maturity / production-readiness, in PowerSync's own words

PowerSync was spun off from JourneyApps Platform in 2022 ([powersync.com/company](https://powersync.com/company)), and the underlying sync engine has **"been used for years in production by a number of Fortune 500 customers in industries such as energy, manufacturing, and mining"** operating in "harsh field conditions" with frequent offline periods — the company's own words are that this usage has **"battle-harden[ed] the PowerSync protocol and architecture over the years."** This is the longest, most concretely-evidenced production track record of the three candidates. That said, maturity is uneven across integrations: PowerSync's [own docs](https://docs.powersync.com/) label **MySQL and SQL Server sources as "Beta,"** **Convex as "Experimental,"** and several client SDKs — Capacitor, Tauri, Node.js, .NET, Rust — as beta or alpha; only the Postgres source path with JS/Web/Flutter/React Native clients reads as the mature, unqualified path.

### Fit for server-side re-validation

Architecturally the closest built-in match among all candidates researched (both here and in ADR-0011) to this app's exact requirement. Every local write is intercepted into a **persistent, crash-and-restart-surviving FIFO upload queue** (internally a `ps_crud` table); a developer-defined `uploadData()` function uploads each queued operation to the backend. Critically, **the backend must process writes synchronously** — "Do not place writes into a server-side queue for later processing" — and rejection is a first-class, documented outcome: *"The server acknowledged the request but rejected the write — validation failure, permission denied, business rule violation. Return 2xx (not 4xx) so the SDK marks the operation as processed... This results in the client reverting the changes in its local database"* ([docs.powersync.com](https://docs.powersync.com/)). Mapped onto this app, this is close to a drop-in match: the backend's `uploadData` handler recomputes correctness via `packages/engine` exactly as `sync/logic.ts` does today, writes the authoritative row, and the client's optimistic local copy is corrected via the normal replication stream if it was wrong — the client never gets to assert an unverified value that sticks.

### Self-hosting story — and the deciding factor

PowerSync Open Edition is a free, source-available, self-hosted offering with **"all the same core functionality as PowerSync Cloud and Enterprise Self-hosted"** minus the visual Dashboard, distributed as the `journeyapps/powersync-service` Docker image, with a PowerSync CLI that sets up a Docker Compose stack ([powersync.com/blog/new-open-era-for-powersync](https://www.powersync.com/blog/new-open-era-for-powersync)). The license is the **Functional Source License (FSL)** — not OSI-approved "open source," source-available with a restriction on competing paid offerings, converting to Apache 2.0 two years after each release; client SDKs use separate, OSI-approved permissive licenses.

The deciding problem is the backend database requirement. PowerSync's documented source databases are **Postgres, MongoDB, MySQL (Beta), SQL Server (Beta), and Convex (Experimental)** ([docs.powersync.com](https://docs.powersync.com/)) — **SQLite is not on this list.** Adopting PowerSync means migrating this app's source-of-truth database off SQLite entirely. On top of that, the PowerSync Service process itself needs its own separate "bucket storage" database for sync state and operation history — historically MongoDB-only, with a 3-node replica set recommended for production ("a single node is fine for development/staging" — [powersync-service-setup docs](https://docs.powersync.com/self-hosting/installation/powersync-service-setup)); as of Service v1.3.8, Postgres can be used for bucket storage instead of MongoDB, but that path is itself labeled **Beta** — "production-ready, provided you've adequately tested your use case" ([releases.powersync.com](https://releases.powersync.com/announcements/introducing-postgres-for-sync-bucket-storage)). So the realistic self-hosted footprint is: a migrated Postgres (or MySQL-Beta) source database, **plus** the PowerSync Service container, **plus** either MongoDB or a second Postgres role for bucket storage — three moving pieces where this app runs one today. On a Raspberry Pi, for a single maintainer, that is a substantially heavier ask than the client-storage problem being solved.

### Anonymous-to-real identity upgrade

PowerSync is sync-only and delegates identity entirely to whatever JWT-based auth the backend already issues — it neither helps nor hinders an anonymous-to-real upgrade flow. This app's own auth design (per the now-folded ADR-0009 plan) would carry over unchanged; PowerSync is neutral here, not a first-class feature the way Jazz v2's local-first auth is.

### Fit for append-only + derived-best-record shape

Arguably the cleanest conceptual fit of the three, precisely because PowerSync's backend of record stays an ordinary relational database (Postgres). There's no CRDT-style merge semantics to fight at all — `trial_results` stays an append-only table, `level_stats` stays a derived cache recomputed by trusted backend code, exactly as today, just with Postgres instead of SQLite underneath and a sync layer replicating the results back to clients.

### Blast radius

The largest of the three by far: migrate the backend database engine off SQLite; stand up and operate a second service (PowerSync Service) with its own storage database; rewrite the upload path around `uploadData()`; rewrite the pull path around PowerSync's sync rules / bucket model. This is not a client-storage-layer change — it's a backend database migration with a sync layer attached.

### Bundle size, pricing, and other rough edges

`@powersync/web` v2.2.0 measures **13,974 bytes gzip / 45,388 bytes minified** on [Bundlephobia](https://bundlephobia.com/package/@powersync/web) — the smallest JS bundle of the three, though it lazily loads ~2.8MB of uncompressed SQLite WASM for client-side storage on top of that. If self-hosting weren't viable, PowerSync Cloud's published tiers are: a **free tier** (2GB synced data/month, 50 concurrent connections), **Pro** at $49/month, **Team** at $599/month, and custom **Enterprise** pricing ([g2.com/products/powersync/pricing](https://www.g2.com/products/powersync/pricing), [powersync.com/pricing](https://powersync.com/pricing)) — noted for context only, since self-hosting (and its SQLite-migration blocker) is the relevant path for this app.

---

## TinyBase (lighter-touch mention)

TinyBase ([tinyplex/tinybase](https://github.com/tinyplex/tinybase), [tinybase.org](https://tinybase.org/)) is MIT-licensed, 5.2k GitHub stars, currently at v9.5.1, with a much smaller footprint and ambition than the other three. It supports both a simple key-value `Values` API and a relational-ish `Tables`/`Rows`/`Cells` model with indexes, cross-table `Relationships`, and a query engine ("select, join, filter, and group data") — so a `Trial results` / `Level runs` / `LevelStats` shape is representable, but TinyBase reads as most naturally suited to simpler, smaller-scale local state than a candidate purpose-built for a typed relational shape the way RxDB or Triplit are. Its sync model is the same "bring your own transport" philosophy as RxDB rather than a vendor sync server: a native-CRDT synchronization protocol that runs "over WebSockets, the browser BroadcastChannel, or your own custom synchronization medium," with a self-hostable WebSocket synchronizer (`synchronizer-ws-server`/`synchronizer-ws-client`) and third-party CRDT integrations (Yjs, Automerge) ([tinybase.org](https://tinybase.org/)). Whether it can support the same "backend independently recomputes and rejects" pattern RxDB and PowerSync support wasn't dug into in depth here — TinyBase is included for completeness and rough positioning, not as a fully-vetted candidate, per the scope of this research.

## Why ElectricSQL and Zero (Rocicorp) are out of scope

**ElectricSQL** is a **Postgres-only sync engine** — it requires Postgres with logical replication enabled as its source, with no other database supported ([electric.ax/sync/postgres-sync](https://electric.ax/sync/postgres-sync), [github.com/electric-sql/electric](https://github.com/electric-sql/electric)) — so, like PowerSync, it would force this app off SQLite, a bigger ask than the other candidates researched here; nothing found in this pass suggests a reason to reconsider that exclusion.

**Zero (Rocicorp)** reached its [1.0 stable release in mid-2026](https://www.infoq.com/news/2026/06/zero-version-1/) but likewise **requires Postgres 15+ with logical replication enabled** as its only supported source database ([rocicorp/zero-docs](https://github.com/rocicorp/zero-docs/blob/main/contents/docs/connecting-to-postgres.mdx)), with broader database support only stated as a future aim — so it carries the same SQLite-migration blocker as PowerSync and ElectricSQL, and is excluded from deep research for the same reason.
