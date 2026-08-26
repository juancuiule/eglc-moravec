import { describe, it, expect, vi } from "vitest";
import { watchStoreTransition } from "./storeWatch";

type FakeState = { value: string };

function makeFakeStore() {
  let listener: ((state: FakeState, prev: FakeState) => void) | null = null;
  return {
    subscribe(l: (state: FakeState, prev: FakeState) => void) {
      listener = l;
      return () => {
        listener = null;
      };
    },
    emit(state: FakeState, prev: FakeState) {
      listener?.(state, prev);
    },
  };
}

describe("watchStoreTransition", () => {
  it("calls onEnter when the state transitions into the target", () => {
    const store = makeFakeStore();
    const onEnter = vi.fn();
    watchStoreTransition(store, (s) => s.value === "b", onEnter);

    store.emit({ value: "b" }, { value: "a" });

    expect(onEnter).toHaveBeenCalledTimes(1);
    expect(onEnter).toHaveBeenCalledWith({ value: "b" });
  });

  it("does not call onEnter when already in the target state (no edge)", () => {
    const store = makeFakeStore();
    const onEnter = vi.fn();
    watchStoreTransition(store, (s) => s.value === "b", onEnter);

    store.emit({ value: "b" }, { value: "b" });

    expect(onEnter).not.toHaveBeenCalled();
  });

  it("does not call onEnter for transitions that don't reach the target", () => {
    const store = makeFakeStore();
    const onEnter = vi.fn();
    watchStoreTransition(store, (s) => s.value === "b", onEnter);

    store.emit({ value: "c" }, { value: "a" });

    expect(onEnter).not.toHaveBeenCalled();
  });

  it("fires again on a second distinct transition into the target", () => {
    const store = makeFakeStore();
    const onEnter = vi.fn();
    watchStoreTransition(store, (s) => s.value === "b", onEnter);

    store.emit({ value: "b" }, { value: "a" });
    store.emit({ value: "a" }, { value: "b" });
    store.emit({ value: "b" }, { value: "a" });

    expect(onEnter).toHaveBeenCalledTimes(2);
  });

  it("stops calling onEnter after unsubscribing", () => {
    const store = makeFakeStore();
    const onEnter = vi.fn();
    const unsubscribe = watchStoreTransition(store, (s) => s.value === "b", onEnter);

    unsubscribe();
    store.emit({ value: "b" }, { value: "a" });

    expect(onEnter).not.toHaveBeenCalled();
  });
});
