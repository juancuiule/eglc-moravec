import { MAX_SYNC_TRIALS } from "engine";
import { createStore } from "zustand/vanilla";
import { Api } from "../api/Api";
import { ApiError } from "../api/utils";
import { authStore, authToken, setLogoutHook } from "../auth/store";
import { markSynced, mergeServerTrials, pendingInputs } from "./trials";
import {
  stashPendingRows,
  takeStashedRows,
  type StashedTrialRow,
} from "./accountStash";
import {
  afterHydration,
  isPersistenceLoading,
  isWipePending,
  localEpoch,
  localStore,
  markWipePending,
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
export const syncStatus = createStore<{ firstPullSettled: boolean }>(() => ({
  firstPullSettled: false,
}));

async function flushPass(): Promise<void> {
  // Epoch captured before any request — a logout wipe mid-pass advances it,
  // and every write below checks it so an old session's response can't
  // repopulate the wiped store.
  const gen = localEpoch();
  let token = authToken(authStore.getState().state);
  if (!token) token = await authStore.getState().ensureSessionToken();
  if (!token) {
    if (pendingInputs().length > 0) scheduleRetry();
    return;
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      // Push in MAX_SYNC_TRIALS chunks; rows enqueued mid-pass get swept into
      // the same pass since pendingInputs() is re-read each round.
      for (;;) {
        const batch = pendingInputs().slice(0, MAX_SYNC_TRIALS);
        if (batch.length === 0) break;
        await Api.syncResults(token, batch);
        if (localEpoch() !== gen) return;
        markSynced(batch.map((i) => i.id));
      }
      const pulled = await Api.fetchTrials(token);
      if (localEpoch() !== gen) return;
      mergeServerTrials(pulled);
      failures = 0;
      return;
    } catch (e) {
      const unauthorized = e instanceof ApiError && e.status === 401;
      if (!unauthorized || attempt === 1) {
        scheduleRetry();
        return;
      }
      // Dead session — but only invalidate if the failed token is still the
      // current identity. OTP login revokes the anonymous token mid-flight:
      // a stale request's 401 must not log the new account session out.
      const current = authStore.getState().state;
      if (authToken(current) === token) {
        const wasAccount = current.type === "logged-in";
        if (wasAccount) {
          // Park unacknowledged rows for THIS account's next sign-in on this
          // device. Pushing them under the about-to-be-minted anonymous
          // identity would re-key them to whoever logs in next — and losing
          // them outright would discard offline work the player earned.
          stashPendingRows(current.email, pendingRowSnapshot());
        }
        authStore.getState().invalidateSession();
        // A dead account's local mirror must not outlive the session on a
        // shared browser — same wipe policy as logout (epoch bump also
        // aborts this pass's own continuations; the re-mint's token-change
        // kick runs a fresh pass that pulls the new session's rows).
        if (wasAccount) resetLocalData();
      }
      token =
        authToken(authStore.getState().state) ??
        (await authStore.getState().ensureSessionToken());
      if (!token) {
        scheduleRetry();
        return;
      }
    }
  }
}

async function runFlush(): Promise<void> {
  try {
    await flushPass();
  } finally {
    inFlight = null;
    // Whatever happened — success, failure, no token — the first attempt
    // settled: gates waiting on "is history loaded yet" can judge on the
    // local store now.
    if (!syncStatus.getState().firstPullSettled) {
      syncStatus.setState({ firstPullSettled: true });
    }
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
        for (const { id, ...cells } of takeStashedRows(email)) {
          localStore.setRow(TRIALS_TABLE, id, { ...cells, synced: false });
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
  // Retention policy: if the push goes undelivered (failure OR budget
  // expiry — a timed-out request may still land server-side, where the
  // trial ids dedup safely), the rows are parked in the account stash and
  // restored when that account signs in on this device. Nothing is dropped.
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
            if (!delivered) {
              stashPendingRows(email, snapshotRows);
              console.warn(
                `localFirst: logout push undelivered — parked ${snapshotRows.length} trial(s) for ${email}'s next sign-in`,
              );
            }
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
