import { describe, expect, it, vi } from "vitest";
import {
  ensureLocalPersistence,
  isLocalStoreHydrated,
  localStore,
  HYDRATED_VALUE,
} from "./store";

// No IndexedDB in the test environment — the same condition as a browser
// without storage support. ensureLocalPersistence must still mark the store
// hydrated so readers degrade to an in-memory session instead of hanging
// on "loading" forever.
describe("ensureLocalPersistence without IndexedDB", () => {
  it("hydrates immediately so readers don't hang", () => {
    expect(typeof indexedDB).toBe("undefined");
    localStore.delValue(HYDRATED_VALUE);
    expect(isLocalStoreHydrated()).toBe(false);

    ensureLocalPersistence();

    expect(isLocalStoreHydrated()).toBe(true);
  });

  it("degrades to hydrated when the persister fails to start", async () => {
    vi.resetModules();
    vi.stubGlobal("indexedDB", {}); // present, but the persister fails to open
    vi.doMock("tinybase/persisters/persister-indexed-db", () => ({
      createIndexedDbPersister: () => ({
        startAutoPersisting: () => Promise.reject(new Error("denied")),
      }),
    }));
    const fresh = await import("./store");
    fresh.localStore.delValue(HYDRATED_VALUE);
    fresh.ensureLocalPersistence();
    await vi.waitFor(() => expect(fresh.isLocalStoreHydrated()).toBe(true));
    vi.unstubAllGlobals();
    vi.doUnmock("tinybase/persisters/persister-indexed-db");
  });

  it("hydrates via the timeout backstop when open() never settles", async () => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.stubGlobal("indexedDB", {});
    const destroy = vi.fn();
    vi.doMock("tinybase/persisters/persister-indexed-db", () => ({
      createIndexedDbPersister: () => ({
        startAutoPersisting: () => new Promise(() => {}), // hangs forever
        destroy,
      }),
    }));
    const fresh = await import("./store");
    fresh.localStore.delValue(HYDRATED_VALUE);
    fresh.ensureLocalPersistence();
    expect(fresh.isLocalStoreHydrated()).toBe(false);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(fresh.isLocalStoreHydrated()).toBe(true);
    expect(destroy).toHaveBeenCalled();

    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.doUnmock("tinybase/persisters/persister-indexed-db");
  });
});
