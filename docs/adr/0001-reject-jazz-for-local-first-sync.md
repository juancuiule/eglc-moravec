# Reject Jazz.tools for local-first sync

Status: accepted

Moravec's synced game data is append-only Trial evidence identified by client-generated ids. The backend already owns authentication, Anonymous-session upgrades, persistence, and the trusted step of validating submitted evidence and deriving correctness before storage. LevelStats is a deterministic fold over stored Level Trial rows, not shared mutable state that needs CRDT conflict resolution.

Jazz.tools was considered for the planned local-first work and rejected. Adopting it would replace the existing accounts, permissions, storage, and sync architecture rather than add durable local delivery to the Fastify + SQLite backend. That is a much larger change than this data model requires and would complicate the requirement that the existing backend revalidate Trial evidence before treating derived values as authoritative.

The approved local-first design instead keeps the backend as the source of truth, uses idempotent append-only replication, and selects TinyBase as the IndexedDB-backed local store. The design remains pending implementation and must be updated against the current schema before work resumes.

Revisit this decision if Moravec's data becomes genuinely shared mutable state, the backend/auth architecture is being replaced for independent reasons, or Jazz gains an integration mode that preserves the current backend's authority without duplicating its responsibilities.
