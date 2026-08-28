import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../sync/pushPracticeResults", () => ({
  pushPracticeResults: vi.fn(),
}));

import { persistStoppedPractice } from "./persistStoppedPractice";
import { pushPracticeResults } from "../sync/pushPracticeResults";
import { Addition, type TrialResult } from "engine";
import type { PracticeStopped } from "./index";
import type { AuthState } from "../auth/store";

function makeResult(): TrialResult {
  const op = Addition.create({ type: "addition", codename: "1d+1d", lDigits: 1, rDigits: 1 });
  return {
    operation: op,
    answer: op.result(),
    correct: true,
    timeExceeded: false,
    timeTaken: 800,
    hintShown: false,
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

const loggedOut: AuthState = { type: "logged-out" };
const anonymous: AuthState = { type: "anonymous", token: "anon-tok" };
const loggedIn: AuthState = { type: "logged-in", token: "tok123", email: "a@b.com" };

describe("persistStoppedPractice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not sync to the backend when logged out", () => {
    persistStoppedPractice(makeStopped(), loggedOut);
    expect(pushPracticeResults).not.toHaveBeenCalled();
  });

  it("syncs results when logged in", () => {
    const state = makeStopped();
    persistStoppedPractice(state, loggedIn);

    expect(pushPracticeResults).toHaveBeenCalledWith("tok123", state.results, state.runId);
  });

  it("also syncs results when anonymous — every session gets pushed, not just logged-in ones", () => {
    const state = makeStopped();
    persistStoppedPractice(state, anonymous);

    expect(pushPracticeResults).toHaveBeenCalledWith("anon-tok", state.results, state.runId);
  });
});
