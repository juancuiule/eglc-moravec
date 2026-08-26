import { describe, it, expect, vi, beforeEach } from "vitest";
import { getOrCreateDeviceId } from "./deviceId";

// Minimal localStorage mock, matching storage/levelStats.test.ts's convention
const store: Record<string, string> = {};
const localStorageMock = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, val: string) => {
    store[key] = val;
  },
  removeItem: (key: string) => {
    delete store[key];
  },
  clear: () => {
    for (const k in store) delete store[k];
  },
};

beforeEach(() => {
  localStorageMock.clear();
  vi.stubGlobal("localStorage", localStorageMock);
});

describe("getOrCreateDeviceId", () => {
  it("creates and persists an id on first call", () => {
    const id = getOrCreateDeviceId();
    expect(id).toBeTruthy();
    expect(store["moravec:deviceId"]).toBe(id);
  });

  it("returns the same id on subsequent calls", () => {
    const first = getOrCreateDeviceId();
    const second = getOrCreateDeviceId();
    expect(second).toBe(first);
  });

  it("falls back to an ephemeral id when localStorage throws", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });

    expect(() => getOrCreateDeviceId()).not.toThrow();
    expect(getOrCreateDeviceId()).toBeTruthy();
  });
});
