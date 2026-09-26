import type { Cell } from "tinybase";

// Account-scoped holding pen for unacknowledged trials. When an account
// session dies mid-outbox (401) or logout's dying-token push goes
// undelivered, the pending rows can't stay in the shared store — the wipe
// protects the next browser user — but they also can't be pushed under the
// next minted identity: rows re-key to whoever logs in next on this
// browser, so an anonymous-attributed push would leak them across accounts.
// They're parked here keyed by a hash of the account's email instead, and
// restored to the outbox only when that same account signs in on this
// device. Server dedup is by trial id, so a restored row that already
// landed (e.g. a timed-out push that secretly succeeded) merges harmlessly.
//
// Everything here is deliberately synchronous: the logout hook must park
// durably and wipe in the same synchronous span — an await between them
// would leave a window where a reload loses rows entirely or skips the
// privacy wipe.
//
// Residual exposure, honestly stated: the rows themselves stay readable in
// localStorage — the same data IndexedDB held while the session was alive.
// What this removes is the standing PII (the key is a hash, not the email —
// fnv-1a is obfuscation, not confidentiality, and a cryptographic hash of
// an easily-guessed email wouldn't be either), the indefinite duration
// (entries expire), and any rendered or syncable access without the
// matching account sign-in.

const STASH_KEY = "moravec.account-pending";
const STASH_MAX_ROWS = 2000;
const STASH_TTL_MS = 30 * 24 * 60 * 60 * 1000; // matches the session cookie age

export type StashedTrialRow = { id: string } & Record<string, Cell>;

type StashEntry = { rows: StashedTrialRow[]; expiresAt: number };
type Stash = Record<string, StashEntry>;

// fnv-1a — deterministic, sync, and enough to keep the raw email out of
// storage. Not a confidentiality boundary for the rows' contents.
function keyFor(email: string): string {
  const n = email.trim().toLowerCase();
  let h = 0x811c9dc5;
  for (let i = 0; i < n.length; i++) {
    h ^= n.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return "a" + (h >>> 0).toString(16);
}

function read(): Stash {
  try {
    if (typeof localStorage === "undefined") return {};
    const parsed: unknown = JSON.parse(localStorage.getItem(STASH_KEY) ?? "{}");
    if (parsed === null || typeof parsed !== "object") return {};
    const stash = parsed as Stash;
    const now = Date.now();
    for (const [key, entry] of Object.entries(stash)) {
      if (
        !entry ||
        typeof entry !== "object" ||
        !Array.isArray(entry.rows) ||
        typeof entry.expiresAt !== "number" ||
        entry.expiresAt <= now
      ) {
        delete stash[key];
      }
    }
    return stash;
  } catch {
    return {};
  }
}

function write(stash: Stash): boolean {
  try {
    if (typeof localStorage === "undefined") return false;
    localStorage.setItem(STASH_KEY, JSON.stringify(stash));
    return true;
  } catch (err) {
    console.warn("localFirst: account stash write failed", err);
    return false;
  }
}

// Returns whether a durable copy actually landed — a caller about to wipe
// the only other copy needs to know the park failed.
export function stashPendingRows(
  email: string,
  rows: readonly StashedTrialRow[],
): boolean {
  if (rows.length === 0) return true;
  const stash = read();
  const key = keyFor(email);
  const existing = stash[key]?.rows ?? [];
  stash[key] = {
    rows: [...existing, ...rows].slice(-STASH_MAX_ROWS),
    expiresAt: Date.now() + STASH_TTL_MS,
  };
  return write(stash);
}

// Non-destructive read — the park is only released once the rows are
// durable elsewhere (a confirmed IndexedDB write or a server push ACK; see
// dropStashedRowIds). Deleting on restore would leave a window where
// neither store holds them.
export function readStashedRows(email: string): StashedTrialRow[] {
  return read()[keyFor(email)]?.rows ?? [];
}

// Rows confirmed durable — server-acked push, or a committed persist —
// are redundant in the stash. Dropped by id across every parked entry:
// delivery is delivery, whichever identity carried it.
export function dropStashedRowIds(ids: readonly string[]): void {
  if (ids.length === 0) return;
  const stash = read();
  const gone = new Set(ids);
  let dirty = false;
  for (const [key, entry] of Object.entries(stash)) {
    const remaining = entry.rows.filter((r) => !gone.has(r.id));
    if (remaining.length !== entry.rows.length) {
      dirty = true;
      if (remaining.length > 0) stash[key] = { ...entry, rows: remaining };
      else delete stash[key];
    }
  }
  if (dirty) write(stash);
}
