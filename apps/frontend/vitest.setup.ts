import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Node ≥22.4 exposes a `localStorage` global that is *undefined* unless
// --localstorage-file is passed — and that broken stub keeps vitest's jsdom
// env from injecting the real one (window IS globalThis in this setup, so
// there's no working storage anywhere). Install an in-memory Storage here:
// the methods go on Storage.prototype (jsdom's own class, which exists and
// works) so tests can still vi.spyOn(Storage.prototype, "setItem") to
// simulate quota/denied-storage failures.
if (globalThis.localStorage === undefined && typeof Storage === "function") {
  const data = new Map<string, string>();
  Object.assign(Storage.prototype, {
    getItem(key: string) {
      return data.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      data.set(key, String(value));
    },
    removeItem(key: string) {
      data.delete(key);
    },
    clear() {
      data.clear();
    },
    key(index: number) {
      return [...data.keys()][index] ?? null;
    },
  });
  Object.defineProperty(Storage.prototype, "length", {
    configurable: true,
    get() {
      return data.size;
    },
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    writable: true,
    value: Object.create(Storage.prototype),
  });
}

afterEach(() => {
  cleanup();
});
