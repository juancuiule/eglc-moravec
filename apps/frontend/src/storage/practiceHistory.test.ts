import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildPersistedPracticeTrials,
  loadPracticeHistory,
  appendPracticeTrials,
} from "./practiceHistory";
import { Addition, Multiplication } from "engine";
import type { PracticeTrialResult } from "../practice/index";

const STORAGE_KEY = "moravec:practiceHistory";

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

function makeResult(overrides: Partial<PracticeTrialResult> = {}): PracticeTrialResult {
  const op = Addition.create({ type: "addition", codename: "1d+1d", lDigits: 1, rDigits: 1 });
  return {
    operation: op,
    answer: op.result(),
    correct: true,
    timeExceeded: false,
    timeTaken: 900,
    hintShown: false,
    keystrokes: [{ key: "1", t: 50 }],
    hasErased: false,
    ...overrides,
  };
}

describe("buildPersistedPracticeTrials", () => {
  it("maps each result to the persisted-practice-trial shape, with no levelNumber field", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    const result = makeResult();
    const [persisted] = buildPersistedPracticeTrials([result]);

    expect(persisted).not.toHaveProperty("levelNumber");
    expect(persisted.categoryCodename).toBe(result.operation.categoryCodename());
    expect(persisted.correct).toBe(true);
    expect(persisted.timeExceeded).toBe(false);
    expect(persisted.timeTaken).toBe(900);
    expect(persisted.keystrokes).toBe(result.keystrokes);
    expect(persisted.playedAt).toBe("2026-01-01T00:00:00.000Z");

    vi.useRealTimers();
  });

  it("carries the category codename from each result's own operation", () => {
    const additionOp = Addition.create({ type: "addition", codename: "1d+1d", lDigits: 1, rDigits: 1 });
    const multOp = Multiplication.create({ type: "multiplication", codename: "1dx1d", lDigits: 1, rDigits: 1 });

    const persisted = buildPersistedPracticeTrials([
      makeResult({ operation: additionOp }),
      makeResult({ operation: multOp }),
    ]);

    expect(persisted[0].categoryCodename).toBe("1d+1d");
    expect(persisted[1].categoryCodename).toBe("1dx1d");
  });

  it("returns an empty array for no results", () => {
    expect(buildPersistedPracticeTrials([])).toEqual([]);
  });
});

describe("loadPracticeHistory / appendPracticeTrials", () => {
  it("returns an empty array when nothing is stored", () => {
    expect(loadPracticeHistory()).toEqual([]);
  });

  it("round-trips appended trials through storage", () => {
    const persisted = buildPersistedPracticeTrials([makeResult()]);
    appendPracticeTrials(persisted);

    expect(loadPracticeHistory()).toEqual(persisted);
  });

  it("accumulates across multiple appends", () => {
    appendPracticeTrials(buildPersistedPracticeTrials([makeResult()]));
    appendPracticeTrials(buildPersistedPracticeTrials([makeResult(), makeResult()]));

    expect(loadPracticeHistory()).toHaveLength(3);
  });

  it("does not touch storage when appending an empty list", () => {
    appendPracticeTrials([]);
    expect(store[STORAGE_KEY]).toBeUndefined();
  });

  it("returns an empty array on malformed JSON", () => {
    store[STORAGE_KEY] = "not-json";
    expect(loadPracticeHistory()).toEqual([]);
  });
});
