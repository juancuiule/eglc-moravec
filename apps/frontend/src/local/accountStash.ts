import type { Cell } from "tinybase";

// Account-scoped holding pen for unacknowledged trials. When an account
// session dies mid-outbox (401) or logout's dying-token push goes
// undelivered, the pending rows can't stay in the shared store — the wipe
// protects the next browser user — but they also can't be pushed under the
// next minted identity: rows re-key to whoever logs in next on this
// browser, so an anonymous-attributed push would leak them across accounts.
// They're parked here keyed by the account's email instead, and restored to
// the outbox only when that same account signs in on this device. Server
// dedup is by trial id, so a restored row that already landed (e.g. a
// timed-out push that secretly succeeded) merges harmlessly.

const STASH_KEY = "moravec.account-pending";
const STASH_MAX_ROWS = 2000;

export type StashedTrialRow = { id: string } & Record<string, Cell>;

type Stash = Record<string, StashedTrialRow[]>;

function read(): Stash {
  try {
    if (typeof localStorage === "undefined") return {};
    const parsed: unknown = JSON.parse(localStorage.getItem(STASH_KEY) ?? "{}");
    return parsed !== null && typeof parsed === "object"
      ? (parsed as Stash)
      : {};
  } catch {
    return {};
  }
}

function write(stash: Stash): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(STASH_KEY, JSON.stringify(stash));
  } catch (err) {
    console.warn("localFirst: account stash write failed", err);
  }
}

export function stashPendingRows(
  email: string,
  rows: readonly StashedTrialRow[],
): void {
  if (rows.length === 0) return;
  const stash = read();
  const key = email.trim().toLowerCase();
  stash[key] = [...(stash[key] ?? []), ...rows].slice(-STASH_MAX_ROWS);
  write(stash);
}

export function takeStashedRows(email: string): StashedTrialRow[] {
  const key = email.trim().toLowerCase();
  const stash = read();
  const rows = stash[key] ?? [];
  if (rows.length === 0) return [];
  delete stash[key];
  write(stash);
  return rows;
}
