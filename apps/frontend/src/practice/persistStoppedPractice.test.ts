import { describe, it, expect, vi, beforeEach } from "vitest";

const { ensureSessionToken } = vi.hoisted(() => ({
  ensureSessionToken: vi.fn<() => Promise<string | null>>(),
}));

vi.mock("../auth/store", () => ({
  authStore: { getState: () => ({ ensureSessionToken }) },
}));
vi.mock("../sync/pushPracticeResults", () => ({
  pushPracticeResults: vi.fn(),
}));

import { persistStoppedPractice } from "./persistStoppedPractice";
import { pushPracticeResults } from "../sync/pushPracticeResults";
import { Addition, type TrialResult } from "engine";
import type { PracticeStopped } from "./index";
import type { AuthState } from "../auth/store";

function makeResult(): TrialResult {
  const op = Addition.create({
    type: "addition",
    codename: "1d+1d",
    lDigits: 1,
    rDigits: 1,
  });
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
const loggedIn: AuthState = {
  type: "logged-in",
  token: "tok123",
  email: "a@b.com",
};

describe("persistStoppedPractice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureSessionToken.mockResolvedValue(null);
  });

  it("makes one session-establishment attempt and syncs a completion that started logged out", async () => {
    ensureSessionToken.mockResolvedValue("fresh-anon-token");
    const state = makeStopped();

    persistStoppedPractice(state, loggedOut);

    await vi.waitFor(() => {
      expect(pushPracticeResults).toHaveBeenCalledWith(
        "fresh-anon-token",
        state.results,
        state.runId,
      );
    });
    expect(ensureSessionToken).toHaveBeenCalledTimes(1);
    expect(pushPracticeResults).toHaveBeenCalledTimes(1);
  });

  it("does not sync when session establishment fails", async () => {
    persistStoppedPractice(makeStopped(), loggedOut);

    await vi.waitFor(() => {
      expect(ensureSessionToken).toHaveBeenCalledTimes(1);
    });
    expect(pushPracticeResults).not.toHaveBeenCalled();
  });

  it("syncs results when logged in", () => {
    const state = makeStopped();
    persistStoppedPractice(state, loggedIn);

    expect(pushPracticeResults).toHaveBeenCalledWith(
      "tok123",
      state.results,
      state.runId,
    );
  });

  it("also syncs results when anonymous — every session gets pushed, not just logged-in ones", () => {
    const state = makeStopped();
    persistStoppedPractice(state, anonymous);

    expect(pushPracticeResults).toHaveBeenCalledWith(
      "anon-tok",
      state.results,
      state.runId,
    );
  });
});
