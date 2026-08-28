import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../storage/practiceHistory", () => ({
  appendPracticeTrials: vi.fn(),
  buildPersistedPracticeTrials: vi.fn(() => [{ fake: "persisted-practice-trial" }]),
}));

vi.mock("../sync/syncEngine", () => ({
  sync: vi.fn(),
}));

import { persistStoppedPractice } from "./persistStoppedPractice";
import { appendPracticeTrials, buildPersistedPracticeTrials } from "../storage/practiceHistory";
import { sync } from "../sync/syncEngine";
import { Addition } from "engine";
import type { PracticeStopped, PracticeTrialResult } from "./index";
import type { AuthState } from "../auth/store";

function makeResult(): PracticeTrialResult {
  const op = Addition.create({ type: "addition", codename: "1d+1d", lDigits: 1, rDigits: 1 });
  return {
    operation: op,
    answer: op.result(),
    correct: true,
    timeExceeded: false,
    timeTaken: 800,
    hintShown: false,
    keystrokes: [],
    hasErased: false,
  };
}

function makeStopped(): PracticeStopped {
  return {
    type: "stopped",
    config: { categoryCodename: "1d+1d" },
    runId: "practice-run-abc",
    results: [makeResult(), makeResult()],
  };
}

const loggedOut: AuthState = { type: "loggedOut" };
const anonymous: AuthState = { type: "anonymous", token: "anon-tok" };
const loggedIn: AuthState = { type: "loggedIn", token: "tok123", email: "a@b.com" };

describe("persistStoppedPractice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(buildPersistedPracticeTrials).mockReturnValue([{ fake: "persisted-practice-trial" }] as never);
  });

  it("always builds and appends the stopped session's trials to Practice history", () => {
    const state = makeStopped();
    persistStoppedPractice(state, loggedOut);

    expect(buildPersistedPracticeTrials).toHaveBeenCalledWith(state.results, state.runId);
    expect(appendPracticeTrials).toHaveBeenCalledWith([{ fake: "persisted-practice-trial" }]);
  });

  // sync() itself decides whether to no-op for a loggedOut session (see
  // sync/syncEngine.test.ts) — persistStoppedPractice just always calls it.
  it.each([
    ["logged out", loggedOut],
    ["anonymous", anonymous],
    ["logged in", loggedIn],
  ])("calls sync with the current authState when %s", (_label, authState) => {
    persistStoppedPractice(makeStopped(), authState);
    expect(sync).toHaveBeenCalledWith(authState);
  });
});
