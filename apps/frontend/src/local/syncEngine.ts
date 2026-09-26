import { MAX_SYNC_TRIALS, type TrialResultInput } from "engine";
import { createStore } from "zustand/vanilla";
import { Api } from "../api/Api";
import { ApiError } from "../api/utils";
import { authStore, authToken, setLogoutHook } from "../auth/store";
import { markSynced, mergeServerTrials, pendingInputs } from "./trials";
import {
  dropStashedRowIds,
  readStashedRows,
  stashPendingRows,
  type StashedTrialRow,
} from "./accountStash";
import {
  afterHydration,
  isPersistenceLoading,
  isWipePending,
  localEpoch,
  localStore,
  markWipePending,
  persistNow,
  resetLocalData,
  TRIALS_TABLE,
} from "./store";

// Flush triggers (all funnel into the same coalesced flush):
//   - kickSync() after every outbox write
//   - the browser "online" event
//   - store boot (startSyncEngine is invoked from AuthBoot)
//   - any auth-token appearance — login, anonymous mint, lazy recovery
// Session establishment lives inside the flush: if there's no token the
// engine asks the auth store for one, so enqueue never waits on auth.

const BACKOFF_MS = [1_000, 2_000, 5_000, 10_000, 30_000];
// Cap on the dying-token flush at logout — long enough for a pending push
// to land, short enough that logout never visibly stalls behind the network.
const LOGOUT_FLUSH_BUDGET_MS = 3_000;

let inFlight: Promise<void> | null = null;
let queued = false;
let failures = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let started = false;

function scheduleRetry(): void {
  if (retryTimer !== null) return;
  const base = BACKOFF_MS[Math.min(failures, BACKOFF_MS.length - 1)];
  failures += 1;
  retryTimer = setTimeout(
    () => {
      retryTimer = null;
      void flush();
    },
    base * (1 + Math.random() * 0.2), // ~20% jitter — avoid thundering retries
  );
}

// Push pending rows (chunked under the wire's MAX_SYNC_TRIALS), then
// pull-merge so the store converges with the server (multi-device +
// pre-local-first history). Idempotent both ways: the backend dedupes pushed
// ids; merges overwrite rows by the same id.
//
// navigator.onLine is deliberately NOT consulted — per the spec it's a hint
// to *attempt*, never a gate; real request outcomes drive the backoff loop.
// Reactive status for UI gates — e.g. LevelPlay holds its locked-redirect
// until the first pull settles, so a fresh device doesn't bounce a deep link
// before the boot flush has merged the player's server history.
export const syncStatus = createStore<{ pullSettledToken: string | null }>(
  () => ({ pullSettledToken: null }),
);

type PassOutcome = "done" | "unauthorized" | "failed" | "stale-epoch";

// Pending rows as MAX_SYNC_TRIALS-sized batches — a generator so the push
// loop reads declaratively; rows enqueued mid-pass get swept in since
// pendingInputs() is re-evaluated at each step.
function* pendingChunks(): Generator<TrialResultInput[]> {
  let batch = pendingInputs().slice(0, MAX_SYNC_TRIALS);
  while (batch.length > 0) {
    yield batch;
    batch = pendingInputs().slice(0, MAX_SYNC_TRIALS);
  }
}

// One round of push-then-pull under a single token. Pure transport +
// classification: all identity healing and retry policy lives in the
// caller. Every store write re-checks the epoch captured by the caller —
// an old session's response must never repopulate a wiped store.
async function pushThenPull(token: string, gen: number): Promise<PassOutcome> {
  try {
    for (const batch of pendingChunks()) {
      await Api.syncResults(token, batch);
      if (localEpoch() !== gen) return "stale-epoch";
      markSynced(batch.map((i) => i.id));
      // The server now owns these ids — any parked fallback is redundant.
      dropStashedRowIds(batch.map((i) => i.id));
    }
    const pulled = await Api.fetchTrials(token);
    if (localEpoch() !== gen) return "stale-epoch";
    mergeServerTrials(pulled);
    return "done";
  } catch (e) {
    return e instanceof ApiError && e.status === 401
      ? "unauthorized"
      : "failed";
  }
}

// A 401 on the CURRENT token: invalidate it, and when it was an account's,
// park its unacknowledged rows (durable, synchronous) and wipe the mirror —
// a dead account's history must not outlive it on a shared browser. A stale
// token's 401 (superseded by a login mid-flight, e.g. OTP revoking the
// anonymous token) heals nothing: the pass just retries under the new
// identity.
function healDeadSession(failedToken: string): void {
  const current = authStore.getState().state;
  if (authToken(current) !== failedToken) return;
  if (current.type === "logged-in") {
    stashPendingRows(current.email, pendingRowSnapshot());
    authStore.getState().invalidateSession();
    resetLocalData();
  } else {
    authStore.getState().invalidateSession();
  }
}

async function flushPass(): Promise<void> {
  // Epoch captured before any request — a logout wipe mid-pass advances it,
  // and pushThenPull's writes check it so an old session's response can't
  // repopulate the wiped store.
  const gen = localEpoch();
  let token =
    authToken(authStore.getState().state) ??
    (await authStore.getState().ensureSessionToken());
  if (!token) {
    if (pendingInputs().length > 0) scheduleRetry();
    return;
  }

  let outcome = await pushThenPull(token, gen);
  if (outcome === "unauthorized") {
    healDeadSession(token);
    token =
      authToken(authStore.getState().state) ??
      (await authStore.getState().ensureSessionToken());
    outcome = token ? await pushThenPull(token, gen) : "failed";
  }

  // A pass that ran to a terminal under this token has settled this
  // session's pull — gates (LevelPlay's locked-redirect) can judge on the
  // local store now. Scoped by token: a login invalidates the previous
  // settle, so a new account's deep link waits for ITS pull. An epoch-abort
  // settles nothing — the next session's own pass will.
  if (outcome !== "stale-epoch" && token !== null) {
    syncStatus.setState({ pullSettledToken: token });
  }
  if (outcome === "failed") scheduleRetry();
}

async function runFlush(): Promise<void> {
  try {
    await flushPass();
  } finally {
    inFlight = null;
    if (queued) {
      queued = false;
      void flush();
    }
  }
}

// Full-row snapshot of the unacknowledged outbox — pendingInputs() returns
// only the wire shape; the stash also needs the display cells
// (correct/timeExceeded) so restored rows render identically.
function pendingRowSnapshot(): StashedTrialRow[] {
  return Object.entries(localStore.getTable(TRIALS_TABLE))
    .filter(([, row]) => row.synced !== true)
    .map(([id, row]) => ({ id, ...row }));
}

function flush(): Promise<void> {
  // Never read or write the store before IndexedDB has loaded — an early
  // pass would see an empty queue and the load would clobber merged rows.
  if (isPersistenceLoading()) {
    return new Promise((resolve) => afterHydration(() => resolve(flush())));
  }
  // A logout wipe is queued but hasn't run yet (it's next in the hydration
  // listener chain) — yield a macrotask so it completes first. Otherwise an
  // earlier-deferred flush could push the dying session's rows under the
  // next session's token.
  if (isWipePending()) {
    return new Promise((resolve) => setTimeout(() => resolve(flush()), 0));
  }
  if (inFlight) {
    queued = true;
    return inFlight;
  }
  inFlight = runFlush();
  return inFlight;
}

/** Fire-and-forget flush trigger — safe to call from any edge. A fresh
 *  trigger resets the backoff: a new write/online/login shouldn't wait out a
 *  previous failure's delay. */
export function kickSync(): void {
  failures = 0;
  if (retryTimer !== null) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  void flush();
}

/** Resolves when the next flush pass completes (success or scheduled retry). */
export function flushSettled(): Promise<void> {
  return flush();
}

/**
 * Browser entry point, called once from AuthBoot. Returns a teardown for
 * tests/Strict Mode remounts.
 */
export function startSyncEngine(): () => void {
  if (started) return () => {};
  started = true;

  const onOnline = () => kickSync();
  window.addEventListener("online", onOnline);

  // A token appearing OR changing — anonymous mint, login, lazy recovery —
  // means a flush that was waiting on (or mis-attributed to) auth can proceed.
  const unsubAuth = authStore.subscribe((state, prev) => {
    if (authToken(state.state) === authToken(prev.state)) return;
    // An account signing back in gets its parked trials back — restored to
    // the outbox as pending so they push under the fresh account token.
    // Only the matching email restores; another account's stash stays put.
    if (state.state.type === "logged-in") {
      const email = state.state.email;
      const gen = localEpoch();
      afterHydration(() => {
        if (localEpoch() !== gen) return;
        // Non-destructive read: the stash stays until the rows are durable
        // elsewhere — a confirmed IndexedDB write, or the next push's server
        // ACK (dropStashedRowIds in the flush). A reload in between loses
        // nothing.
        const rows = readStashedRows(email);
        for (const { id, ...cells } of rows) {
          localStore.setRow(TRIALS_TABLE, id, { ...cells, synced: false });
        }
        if (rows.length > 0) {
          const ids = rows.map((r) => r.id);
          void persistNow().then((ok) => {
            if (ok) dropStashedRowIds(ids);
          });
        }
      });
    }
    kickSync();
  });

  // Logout: snapshot the outgoing session's pending rows, wipe the table
  // atomically, then push the snapshot under the dying token (bounded).
  // Wipe-first ordering closes three races at once:
  //   - rows enqueued afterwards belong to the new anonymous session
  //     (re-minted while this runs) and land post-wipe, untouched;
  //   - the token-change flush kicked by that re-mint finds an empty queue,
  //     so account rows can't be claimed under the anonymous identity and
  //     re-keyed to whoever logs in next on this browser;
  //   - a mid-flight pull-merge can't resurrect wiped rows.
  // Retention policy: the durable stash copy is written BEFORE the wipe —
  // a reload during the push window can't lose the rows. A successful push
  // drops the parked copy; an undelivered one (failure OR budget expiry — a
  // timed-out request may still land server-side, where trial ids dedup
  // safely) stays parked for the account's next sign-in on this device.
  setLogoutHook(
    (token, email) =>
      new Promise<void>((resolve) => {
        // Armed synchronously — even when hydration defers the wipe itself,
        // no flush may start pushing the dying session's rows meanwhile
        // (a flush deferred earlier would otherwise beat the wipe in the
        // hydration listener chain).
        markWipePending();
        afterHydration(() => {
          const snapshot = pendingInputs();
          const snapshotRows = pendingRowSnapshot();
          const snapshotIds = snapshotRows.map((r) => r.id);
          // Durable before destructive — both synchronous, so no reload can
          // land between park and wipe. If the park fails, wiping erases the
          // only copy: say so loudly.
          const parked = stashPendingRows(email, snapshotRows);
          if (!parked) {
            console.error(
              "localFirst: logout could not park pending trials — a failed push now loses them",
            );
          }
          // resetLocalData also bumps the local epoch — in-flight pushes'
          // markSynced and pending pull-merges from the old session are
          // epoch-guarded and can't resurrect what we're wiping.
          resetLocalData();
          let delivered = false;
          void Promise.race([
            (async () => {
              for (let i = 0; i < snapshot.length; i += MAX_SYNC_TRIALS) {
                await Api.syncResults(
                  token,
                  snapshot.slice(i, i + MAX_SYNC_TRIALS),
                );
              }
            })().then(
              () => {
                delivered = true;
              },
              () => {},
            ),
            new Promise((r) => setTimeout(r, LOGOUT_FLUSH_BUDGET_MS)),
          ]).finally(() => {
            if (delivered) dropStashedRowIds(snapshotIds);
            else if (parked)
              console.warn(
                `localFirst: logout push undelivered — ${snapshotRows.length} trial(s) stay parked for ${email}'s next sign-in`,
              );
            resolve();
          });
        });
      }),
  );

  kickSync(); // boot flush — drains anything persisted from a prior session

  return () => {
    started = false;
    window.removeEventListener("online", onOnline);
    unsubAuth();
    setLogoutHook(null);
    if (retryTimer !== null) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  };
}
