import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../storage/practiceHistory", () => ({
  appendPracticeTrials: vi.fn(),
  buildPersistedPracticeTrials: vi.fn(() => [{ fake: "persisted-practice-trial" }]),
}));

vi.mock("../sync/pushPracticeResults", () => ({
  pushPracticeResults: vi.fn(),
}));

import { persistStoppedPractice } from "./persistStoppedPractice";
import { appendPracticeTrials, buildPersistedPracticeTrials } from "../storage/practiceHistory";
import { pushPracticeResults } from "../sync/pushPracticeResults";
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

  it("does not sync to the backend when logged out", () => {
    persistStoppedPractice(makeStopped(), loggedOut);
    expect(pushPracticeResults).not.toHaveBeenCalled();
  });

  it("syncs results when logged in", () => {
    const state = makeStopped();
    persistStoppedPractice(state, loggedIn);

    expect(pushPracticeResults).toHaveBeenCalledWith("tok123", state.results, [
      { fake: "persisted-practice-trial" },
    ]);
  });

  it("also syncs results when anonymous — every session gets pushed, not just logged-in ones", () => {
    const state = makeStopped();
    persistStoppedPractice(state, anonymous);

    expect(pushPracticeResults).toHaveBeenCalledWith("anon-tok", state.results, [
      { fake: "persisted-practice-trial" },
    ]);
  });
});
