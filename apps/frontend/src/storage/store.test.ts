import { describe, it, expect } from "vitest";
import { createLocalStore, localStore, resetLocalStore } from "./store";

describe("createLocalStore", () => {
  it("starts with no rows in trials or levelRuns", () => {
    const store = createLocalStore();
    expect(store.getRowIds("trials")).toEqual([]);
    expect(store.getRowIds("levelRuns")).toEqual([]);
  });

  it("returns a fresh, independent store on each call", () => {
    const a = createLocalStore();
    const b = createLocalStore();
    a.setRow("trials", "t1", { id: "t1" });

    expect(b.getRowIds("trials")).toEqual([]);
  });
});

describe("resetLocalStore", () => {
  it("clears every row from the shared singleton store", () => {
    localStore.setRow("trials", "t1", { id: "t1" });
    localStore.setRow("levelRuns", "r1", { id: "r1" });

    resetLocalStore();

    expect(localStore.getRowIds("trials")).toEqual([]);
    expect(localStore.getRowIds("levelRuns")).toEqual([]);
  });
});
