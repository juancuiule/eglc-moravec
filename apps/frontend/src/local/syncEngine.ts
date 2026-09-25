import { MAX_SYNC_TRIALS } from "engine";
import { createStore } from "zustand/vanilla";
import { Api } from "../api/Api";
import { ApiError } from "../api/utils";
import { authStore, authToken, setLogoutHook } from "../auth/store";
import { markSynced, mergeServerTrials, pendingInputs } from "./trials";
import {
  afterHydration,
  isPersistenceLoading,
  localEpoch,
  resetLocalData,
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
      if (authToken(authStore.getState().state) === token) {
        authStore.getState().invalidateSession();
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

function flush(): Promise<void> {
  // Never read or write the store before IndexedDB has loaded — an early
  // pass would see an empty queue and the load would clobber merged rows.
  if (isPersistenceLoading()) {
    return new Promise((resolve) => afterHydration(() => resolve(flush())));
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
    if (authToken(state.state) !== authToken(prev.state)) kickSync();
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
  // Deliberate policy: rows are discarded even if the push fails — privacy
  // over retention — but the loss is logged, never silent.
  setLogoutHook(
    (token) =>
      new Promise<void>((resolve) => {
        afterHydration(() => {
          const snapshot = pendingInputs();
          // resetLocalData also bumps the local epoch — in-flight pushes'
          // markSynced and pending pull-merges from the old session are
          // epoch-guarded and can't resurrect what we're wiping.
          resetLocalData();
          void Promise.race([
            (async () => {
              for (let i = 0; i < snapshot.length; i += MAX_SYNC_TRIALS) {
                await Api.syncResults(
                  token,
                  snapshot.slice(i, i + MAX_SYNC_TRIALS),
                );
              }
            })().catch((e) =>
              console.warn(
                "logout flush failed — discarding pending trials",
                e,
              ),
            ),
            new Promise((r) => setTimeout(r, LOGOUT_FLUSH_BUDGET_MS)),
          ]).finally(resolve);
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
