import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { PracticePlay } from "./PracticePlay";
import { practiceStore } from "@/practice/store";

const router = { replace: vi.fn(), push: vi.fn() };
vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

const localStorageStore: Record<string, string> = {};
const localStorageMock = {
  getItem: (key: string) => localStorageStore[key] ?? null,
  setItem: (key: string, val: string) => {
    localStorageStore[key] = val;
  },
  removeItem: (key: string) => {
    delete localStorageStore[key];
  },
  clear: () => {
    for (const k in localStorageStore) delete localStorageStore[k];
  },
};

beforeEach(() => {
  localStorageMock.clear();
  vi.stubGlobal("localStorage", localStorageMock);
  practiceStore.getState().reset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("fresh mount starts a Playing run for the given category", () => {
  render(<PracticePlay categoryCodename="1dx1d" />);

  const state = practiceStore.getState().state;
  expect(state.type).toBe("playing");
  if (state.type === "playing") {
    expect(state.config.categoryCodename).toBe("1dx1d");
    expect(state.results).toEqual([]);
    expect(state.trialId).toBe(0);
  }
});

test("switching to a different category mid-play abandons the in-progress run and starts fresh for the new category", () => {
  const { rerender } = render(<PracticePlay categoryCodename="1dx1d" />);
  expect(practiceStore.getState().state.type).toBe("playing");
  const firstRunId =
    practiceStore.getState().state.type === "playing"
      ? (practiceStore.getState().state as { runId: string }).runId
      : null;

  // Still mid-play on 1dx1d — navigating straight to another category's URL
  // rerenders this same component with a new categoryCodename, no unmount.
  act(() => {
    rerender(<PracticePlay categoryCodename="1d+1d" />);
  });

  const state = practiceStore.getState().state;
  expect(state.type).toBe("playing");
  if (state.type === "playing") {
    expect(state.config.categoryCodename).toBe("1d+1d");
    expect(state.runId).not.toBe(firstRunId);
    expect(state.results).toEqual([]);
    expect(state.trialId).toBe(0);
  }
});

test("revisiting the same category after stopping starts a fresh run, not the stale Stopped state", () => {
  const { unmount } = render(<PracticePlay categoryCodename="1dx1d" />);

  expect(practiceStore.getState().state.type).toBe("playing");

  act(() => {
    practiceStore.getState().timeUp(null);
    practiceStore.getState().advance();
    practiceStore.getState().stop();
  });
  expect(practiceStore.getState().state.type).toBe("stopped");
  const stoppedRunId =
    practiceStore.getState().state.type === "stopped"
      ? (practiceStore.getState().state as { runId: string }).runId
      : null;

  // Leaving the route (e.g. navigating to the practice menu) unmounts PracticePlay.
  unmount();

  // Revisiting the same category remounts it — this should not resume the
  // stale Stopped state from the previous visit.
  render(<PracticePlay categoryCodename="1dx1d" />);

  const state = practiceStore.getState().state;
  expect(state.type).toBe("playing");
  if (state.type === "playing") {
    expect(state.runId).not.toBe(stoppedRunId);
    expect(state.results).toEqual([]);
    expect(state.trialId).toBe(0);
  }
});
