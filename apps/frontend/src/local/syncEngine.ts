import { MAX_SYNC_TRIALS } from "engine";
import { Api } from "../api/Api";
import { ApiError } from "../api/utils";
import { authStore, authToken, setLogoutHook } from "../auth/store";
import { markSynced, mergeServerTrials, pendingInputs } from "./trials";
import { afterHydration, isPersistenceLoading, resetLocalData } from "./store";

// Flush triggers (all funnel into the same coalesced flush):
//   - kickSync() after every outbox write
//   - the browser "online" event
//   - store boot (startSyncEngine is invoked from AuthBoot)
//   - any auth-token appearance — login, anonymous mint, lazy recovery
// Session establishment lives inside the flush: if there's no token the
// engine asks the auth store for one, so enqueue never waits on auth.

const BACKOFF_MS = [1_000, 2_000, 5_000, 10_000, 30_000];

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
async function flushPass(tokenOverride?: string): Promise<void> {
  let token = tokenOverride ?? authToken(authStore.getState().state) ?? null;
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
        markSynced(batch.map((i) => i.id));
      }
      // Skip the pull for the dying-token logout flush — data is about to be
      // wiped anyway.
      if (tokenOverride === undefined) {
        mergeServerTrials(await Api.fetchTrials(token));
      }
      failures = 0;
      return;
    } catch (e) {
      const unauthorized = e instanceof ApiError && e.status === 401;
      if (!unauthorized || attempt === 1 || tokenOverride !== undefined) {
        scheduleRetry();
        return;
      }
      // Dead session — drop it and re-mint anonymous against the stable
      // device id, then retry this pass exactly once.
      authStore.getState().invalidateSession();
      token = await authStore.getState().ensureSessionToken();
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

  // Logout: best-effort push of anything pending under the dying token, then
  // wipe the store so a shared browser leaks nothing. Deferred past hydration
  // so a mid-load wipe isn't clobbered by the initial IDB load.
  setLogoutHook((token) => {
    afterHydration(() => {
      void flushPass(token).finally(resetLocalData);
    });
  });

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
