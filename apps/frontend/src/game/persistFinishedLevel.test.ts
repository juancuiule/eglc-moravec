import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../sync/pushResults", () => ({
  pushResults: vi.fn(() => Promise.resolve()),
}));
vi.mock("../api/Api", () => ({
  Api: { fetchLevelStats: vi.fn() },
}));

import { persistFinishedLevel } from "./persistFinishedLevel";
import { pushResults } from "../sync/pushResults";
import { Api } from "../api/Api";
import { Addition, type TrialResult } from "engine";
import type { Level } from "../level";
import type { Finished } from "./index";
import type { AuthState } from "../auth/store";
import type { LevelStats } from "../api/Api";

// A fixed fixture, not the real catalog's level 1 — tests shouldn't depend
// on production Level content (which now lives in the backend).
const LEVEL_FIXTURE: Level = { "1d+1d": 50, "1dx1d": 50 };

function makeResult(timeTaken: number): TrialResult {
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
    timeTaken,
    hintShown: false,
  };
}

function makeFinished(): Finished {
  return {
    type: "finished",
    config: { levelNumber: 4, level: LEVEL_FIXTURE, totalTrials: 20 },
    runId: "run-abc",
    results: [makeResult(1000), makeResult(1500)],
    correctCount: 2,
    levelCompleted: true,
    stars: 2,
  };
}

const loggedOut: AuthState = { type: "logged-out" };
const anonymous: AuthState = { type: "anonymous", token: "anon-tok" };
const loggedIn: AuthState = {
  type: "logged-in",
  token: "tok123",
  email: "a@b.com",
};

describe("persistFinishedLevel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(pushResults).mockResolvedValue(undefined);
    vi.mocked(Api.fetchLevelStats).mockResolvedValue({});
  });

  it("isNewRecord is true when there's no previous record for the level", () => {
    expect(
      persistFinishedLevel(makeFinished(), loggedOut, undefined).isNewRecord,
    ).toBe(true);
  });

  it("isNewRecord is true when this run beats the previous record (more stars)", () => {
    const previousRecord: LevelStats = {
      stars: 1,
      totalTime: 5000,
      completedAt: "x",
    };
    expect(
      persistFinishedLevel(makeFinished(), loggedOut, previousRecord)
        .isNewRecord,
    ).toBe(true); // this run: 2 stars
  });

  it("isNewRecord is false when this run does not beat the previous record", () => {
    const previousRecord: LevelStats = {
      stars: 3,
      totalTime: 5000,
      completedAt: "x",
    };
    expect(
      persistFinishedLevel(makeFinished(), loggedOut, previousRecord)
        .isNewRecord,
    ).toBe(false); // this run: 2 stars
  });

  it("record carries this run's stars/totalTime when it's a new record", () => {
    const { record } = persistFinishedLevel(
      makeFinished(),
      loggedOut,
      undefined,
    );
    expect(record.stars).toBe(2);
    expect(record.totalTime).toBe(2500); // 1000 + 1500
  });

  it("record stays the previous record unchanged when this run doesn't beat it", () => {
    const previousRecord: LevelStats = {
      stars: 3,
      totalTime: 5000,
      completedAt: "x",
    };
    const { record } = persistFinishedLevel(
      makeFinished(),
      loggedOut,
      previousRecord,
    );
    expect(record).toBe(previousRecord);
  });

  it("ratchets across two calls — the second call's isNewRecord reflects the first call's own result", () => {
    const first = persistFinishedLevel(makeFinished(), loggedOut, undefined);
    expect(first.isNewRecord).toBe(true); // 2 stars, no previous record

    // A second, better run (3 stars) — compared against the FIRST call's
    // own returned record, not the original (undefined) previousRecord.
    const secondFinished: Finished = { ...makeFinished(), stars: 3 };
    const second = persistFinishedLevel(
      secondFinished,
      loggedOut,
      first.record,
    );
    expect(second.isNewRecord).toBe(true);

    // A third run, same as the first (2 stars) — now loses against the
    // ratcheted best (3 stars), proving the ratchet actually took hold.
    const third = persistFinishedLevel(
      makeFinished(),
      loggedOut,
      second.record,
    );
    expect(third.isNewRecord).toBe(false);
  });

  it("does not sync to the backend when logged out", () => {
    persistFinishedLevel(makeFinished(), loggedOut, undefined);

    expect(pushResults).not.toHaveBeenCalled();
  });

  it("refreshed resolves to the unchanged record when logged out — nothing was pushed", async () => {
    const { record, refreshed } = persistFinishedLevel(
      makeFinished(),
      loggedOut,
      undefined,
    );
    await expect(refreshed).resolves.toBe(record);
  });

  it("syncs results when logged in", () => {
    const state = makeFinished();
    persistFinishedLevel(state, loggedIn, undefined);

    expect(pushResults).toHaveBeenCalledWith(
      "tok123",
      state.config.levelNumber,
      state.results,
      state.runId,
    );
  });

  it("also syncs results when anonymous — every session gets pushed, not just logged-in ones", () => {
    const state = makeFinished();
    persistFinishedLevel(state, anonymous, undefined);

    expect(pushResults).toHaveBeenCalledWith(
      "anon-tok",
      state.config.levelNumber,
      state.results,
      state.runId,
    );
  });

  it("refreshed resolves to the server-confirmed record once the push lands and a fetch confirms it", async () => {
    const state = makeFinished();
    const serverRecord: LevelStats = {
      stars: 3,
      totalTime: 2000,
      completedAt: "2026-01-01T00:00:00.000Z",
    };
    vi.mocked(Api.fetchLevelStats).mockResolvedValue({
      [String(state.config.levelNumber)]: serverRecord,
    });

    const { refreshed } = persistFinishedLevel(state, loggedIn, undefined);
    await expect(refreshed).resolves.toEqual(serverRecord);
    expect(Api.fetchLevelStats).toHaveBeenCalledWith("tok123");
  });

  it("refreshed rejects when the follow-up fetch fails", async () => {
    vi.mocked(Api.fetchLevelStats).mockRejectedValue(new Error("network down"));

    const { refreshed } = persistFinishedLevel(
      makeFinished(),
      loggedIn,
      undefined,
    );
    await expect(refreshed).rejects.toThrow("network down");
  });
});
