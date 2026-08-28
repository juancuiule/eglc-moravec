import { describe, it, expect } from "vitest";
import {
  parseTrialResults,
  parseSyncRequest,
  evaluateTrialResult,
  deriveLevelRuns,
  buildSyncResponsePlan,
  toWireTrial,
  toWireLevelRun,
} from "./logic.js";

const validTrial = {
  id: "trial-abc",
  levelNumber: 3,
  categoryCodename: "1d+1d",
  correct: true,
  timeExceeded: false,
  timeTaken: 1200,
  playedAt: 1_700_000_000_000,
  keystrokes: [{ key: "9", t: 100 }, { key: "2", t: 340 }],
  operands: [4, 5],
  answer: 9,
  hintShown: false,
  streakAtSubmit: 2,
  hintsAvailableAtStart: 3,
  runId: "run-abc",
  runType: "level" as const,
};

describe("parseTrialResults", () => {
  it("accepts a well-formed body", () => {
    expect(parseTrialResults({ trials: [validTrial] })).toEqual([validTrial]);
  });

  it("accepts an empty trials array", () => {
    expect(parseTrialResults({ trials: [] })).toEqual([]);
  });

  it("rejects a body with no trials field", () => {
    expect(parseTrialResults({})).toBeNull();
  });

  it("rejects a non-array trials field", () => {
    expect(parseTrialResults({ trials: "nope" })).toBeNull();
  });

  it("rejects a trial missing a required field", () => {
    const { timeTaken: _timeTaken, ...incomplete } = validTrial;
    expect(parseTrialResults({ trials: [incomplete] })).toBeNull();
  });

  it("rejects a trial with a wrong-typed field", () => {
    expect(parseTrialResults({ trials: [{ ...validTrial, correct: "yes" }] })).toBeNull();
  });

  it("accepts an empty keystrokes array", () => {
    const trial = { ...validTrial, keystrokes: [] };
    expect(parseTrialResults({ trials: [trial] })).toEqual([trial]);
  });

  it("rejects a trial with a malformed keystroke", () => {
    const trial = { ...validTrial, keystrokes: [{ key: "9", t: "not-a-number" }] };
    expect(parseTrialResults({ trials: [trial] })).toBeNull();
  });

  it("rejects a trial with a non-array keystrokes field", () => {
    const trial = { ...validTrial, keystrokes: "nope" };
    expect(parseTrialResults({ trials: [trial] })).toBeNull();
  });

  it("accepts a null answer (a timed-out trial)", () => {
    const trial = { ...validTrial, answer: null };
    expect(parseTrialResults({ trials: [trial] })).toEqual([trial]);
  });

  it("rejects a trial with a non-array operands field", () => {
    const trial = { ...validTrial, operands: "nope" };
    expect(parseTrialResults({ trials: [trial] })).toBeNull();
  });

  it("rejects a trial with a non-numeric operand", () => {
    const trial = { ...validTrial, operands: [4, "5"] };
    expect(parseTrialResults({ trials: [trial] })).toBeNull();
  });

  it("rejects a trial with a wrong-typed answer", () => {
    const trial = { ...validTrial, answer: "9" };
    expect(parseTrialResults({ trials: [trial] })).toBeNull();
  });

  it("rejects a trial with a wrong-typed hintShown", () => {
    const trial = { ...validTrial, hintShown: "yes" };
    expect(parseTrialResults({ trials: [trial] })).toBeNull();
  });

  it("rejects a trial with a wrong-typed streakAtSubmit", () => {
    const trial = { ...validTrial, streakAtSubmit: "2" };
    expect(parseTrialResults({ trials: [trial] })).toBeNull();
  });

  it("rejects a trial with a wrong-typed hintsAvailableAtStart", () => {
    const trial = { ...validTrial, hintsAvailableAtStart: "3" };
    expect(parseTrialResults({ trials: [trial] })).toBeNull();
  });

  it("rejects a trial with a wrong-typed runId", () => {
    const trial = { ...validTrial, runId: 123 };
    expect(parseTrialResults({ trials: [trial] })).toBeNull();
  });

  it("rejects a trial with an invalid runType", () => {
    const trial = { ...validTrial, runType: "bogus" };
    expect(parseTrialResults({ trials: [trial] })).toBeNull();
  });

  it("rejects a trial missing id — it's the dedup key for idempotent inserts", () => {
    const { id: _id, ...incomplete } = validTrial;
    expect(parseTrialResults({ trials: [incomplete] })).toBeNull();
  });

  it("rejects a trial with a wrong-typed id", () => {
    const trial = { ...validTrial, id: 123 };
    expect(parseTrialResults({ trials: [trial] })).toBeNull();
  });

  it("accepts a Practice trial with runType practice and a null levelNumber", () => {
    const trial = { ...validTrial, runType: "practice" as const, levelNumber: null };
    expect(parseTrialResults({ trials: [trial] })).toEqual([trial]);
  });

  it("rejects a non-number, non-null levelNumber", () => {
    const trial = { ...validTrial, levelNumber: "3" };
    expect(parseTrialResults({ trials: [trial] })).toBeNull();
  });

  it("rejects null and non-object bodies", () => {
    expect(parseTrialResults(null)).toBeNull();
    expect(parseTrialResults("nope")).toBeNull();
  });
});

describe("parseSyncRequest", () => {
  it("accepts a well-formed body", () => {
    expect(parseSyncRequest({ cursor: 0, trials: [validTrial] })).toEqual({
      cursor: 0,
      trials: [validTrial],
    });
  });

  it("accepts a pull-only request (empty trials)", () => {
    expect(parseSyncRequest({ cursor: 5, trials: [] })).toEqual({ cursor: 5, trials: [] });
  });

  it("rejects a missing cursor", () => {
    expect(parseSyncRequest({ trials: [] })).toBeNull();
  });

  it("rejects a non-number cursor", () => {
    expect(parseSyncRequest({ cursor: "0", trials: [] })).toBeNull();
  });

  it("rejects a negative cursor", () => {
    expect(parseSyncRequest({ cursor: -1, trials: [] })).toBeNull();
  });

  it("rejects a non-finite cursor (typeof Infinity is 'number', so this needs its own check)", () => {
    expect(parseSyncRequest({ cursor: Infinity, trials: [] })).toBeNull();
  });

  it("rejects a non-integer cursor", () => {
    expect(parseSyncRequest({ cursor: 1.5, trials: [] })).toBeNull();
  });

  it("rejects an invalid trial the same way parseTrialResults does", () => {
    const { id: _id, ...incompleteTrial } = validTrial;
    expect(parseSyncRequest({ cursor: 0, trials: [incompleteTrial] })).toBeNull();
  });

  it("rejects null and non-object bodies", () => {
    expect(parseSyncRequest(null)).toBeNull();
    expect(parseSyncRequest("nope")).toBeNull();
  });
});

describe("toWireTrial", () => {
  it("maps a stored trial row to the pull wire shape, omitting keystrokes and client claims", () => {
    const row = {
      id: "trial-1",
      email_hash: "hash-1",
      level_number: 4,
      category_codename: "1d+1d",
      correct: 1,
      time_exceeded: 0,
      client_correct: 1,
      client_time_exceeded: 0,
      time_taken: 1200,
      played_at: 1_700_000_000_000,
      hint_shown: 1,
      streak_at_submit: 2,
      hints_available_at_start: 3,
      run_id: "run-1",
      run_type: "level",
    };

    expect(toWireTrial(row)).toEqual({
      id: "trial-1",
      runType: "level",
      levelNumber: 4,
      categoryCodename: "1d+1d",
      correct: true,
      timeExceeded: false,
      timeTaken: 1200,
      playedAt: 1_700_000_000_000,
      hintShown: true,
      streakAtSubmit: 2,
      hintsAvailableAtStart: 3,
      runId: "run-1",
    });
  });

  it("maps the Practice level_number sentinel (0) back to null", () => {
    const row = {
      id: "trial-1",
      email_hash: "hash-1",
      level_number: 0,
      category_codename: "1dx1d",
      correct: 1,
      time_exceeded: 0,
      client_correct: 1,
      client_time_exceeded: 0,
      time_taken: 1200,
      played_at: 1_700_000_000_000,
      hint_shown: 0,
      streak_at_submit: 0,
      hints_available_at_start: 0,
      run_id: "practice-1",
      run_type: "practice",
    };

    expect(toWireTrial(row).levelNumber).toBeNull();
  });
});

describe("toWireLevelRun", () => {
  it("maps a stored level run row to the pull wire shape", () => {
    const row = {
      id: "run-1",
      email_hash: "hash-1",
      level_number: 4,
      stars: 3,
      total_time: 9000,
      level_completed: 1,
      played_at: 1_700_000_000_000,
    };

    expect(toWireLevelRun(row)).toEqual({
      id: "run-1",
      levelNumber: 4,
      stars: 3,
      totalTime: 9000,
      levelCompleted: true,
      playedAt: 1_700_000_000_000,
    });
  });
});

describe("evaluateTrialResult", () => {
  it("confirms a client claim that matches the server's own recomputation", () => {
    const evaluated = evaluateTrialResult(validTrial);
    expect(evaluated.correct).toBe(true);
    expect(evaluated.timeExceeded).toBe(false);
    expect(evaluated.clientCorrect).toBe(true);
    expect(evaluated.clientTimeExceeded).toBe(false);
  });

  it("passes id, hintShown, streakAtSubmit, hintsAvailableAtStart, runId, and runType through unchanged", () => {
    const evaluated = evaluateTrialResult(validTrial);
    expect(evaluated.id).toBe("trial-abc");
    expect(evaluated.hintShown).toBe(false);
    expect(evaluated.streakAtSubmit).toBe(2);
    expect(evaluated.hintsAvailableAtStart).toBe(3);
    expect(evaluated.runId).toBe("run-abc");
    expect(evaluated.runType).toBe("level");
  });

  it("passes through a null levelNumber for a Practice trial", () => {
    const trial = { ...validTrial, runType: "practice" as const, levelNumber: null };
    expect(evaluateTrialResult(trial).levelNumber).toBeNull();
  });

  it("overrides a client claim that disagrees with the server's own recomputation, keeping the claim for auditing", () => {
    // operands say 4 + 5 = 9, but the client claims a wrong answer was correct
    const trial = { ...validTrial, answer: 100, correct: true };
    const evaluated = evaluateTrialResult(trial);

    expect(evaluated.correct).toBe(false); // server-computed wins
    expect(evaluated.clientCorrect).toBe(true); // original claim preserved for auditing
  });
});

function evaluatedTrial(overrides: Partial<ReturnType<typeof evaluateTrialResult>> = {}) {
  return {
    id: "trial-1",
    levelNumber: 4,
    categoryCodename: "1d+1d",
    correct: true,
    timeExceeded: false,
    clientCorrect: true,
    clientTimeExceeded: false,
    timeTaken: 1000,
    playedAt: 1_700_000_000_000,
    keystrokes: [],
    hintShown: false,
    streakAtSubmit: 0,
    hintsAvailableAtStart: 3,
    runId: "run-1",
    runType: "level" as const,
    ...overrides,
  };
}

describe("deriveLevelRuns", () => {
  it("derives stars/totalTime/levelCompleted for a single run from its trial batch", () => {
    const trials = [
      evaluatedTrial({ timeTaken: 1000 }),
      evaluatedTrial({ timeTaken: 2000 }),
      evaluatedTrial({ correct: false, timeTaken: 3000 }),
    ];

    const [summary] = deriveLevelRuns(trials);
    expect(summary.levelRunId).toBe("run-1");
    expect(summary.levelNumber).toBe(4);
    expect(summary.totalTime).toBe(6000); // sums every trial, not just correct ones
    expect(summary.stars).toBe(0); // 2 correct < LEVEL_COMPLETE_THRESHOLD (15)
    expect(summary.levelCompleted).toBe(false);
  });

  it("bases stars/completion on the server-computed correct, not the client's claim", () => {
    const trials = Array.from({ length: 20 }, () =>
      evaluatedTrial({ correct: false, clientCorrect: true }), // client claims correct; server disagrees
    );

    const [summary] = deriveLevelRuns(trials);
    expect(summary.stars).toBe(0);
    expect(summary.levelCompleted).toBe(false);
  });

  it("marks a run completed once correct trials reach the threshold", () => {
    const trials = Array.from({ length: 20 }, () => evaluatedTrial());
    const [summary] = deriveLevelRuns(trials);
    expect(summary.levelCompleted).toBe(true);
    expect(summary.stars).toBe(3);
  });

  it("counts a correct-but-late trial toward stars — timing no longer gates correctness", () => {
    const trials = Array.from({ length: 20 }, () => evaluatedTrial({ timeExceeded: true }));
    const [summary] = deriveLevelRuns(trials);
    expect(summary.stars).toBe(3);
    expect(summary.levelCompleted).toBe(true);
  });

  it("groups a mixed batch by run id, scoring each run independently", () => {
    const trials = [
      ...Array.from({ length: 20 }, () => evaluatedTrial({ runId: "run-1", levelNumber: 1 })), // 20 correct → 3 stars
      evaluatedTrial({ runId: "run-2", levelNumber: 2, correct: false }), // 0 correct → 0 stars
    ];

    const summaries = deriveLevelRuns(trials);
    expect(summaries.find((s) => s.levelRunId === "run-1")).toMatchObject({ levelNumber: 1, stars: 3 });
    expect(summaries.find((s) => s.levelRunId === "run-2")).toMatchObject({ levelNumber: 2, stars: 0 });
  });

  it("returns an empty array for no trials", () => {
    expect(deriveLevelRuns([])).toEqual([]);
  });

  it("derives playedAt as the latest of the run's trials — when the run actually happened, not when it's synced", () => {
    const trials = [
      evaluatedTrial({ playedAt: 1_700_000_001_000 }),
      evaluatedTrial({ playedAt: 1_700_000_003_000 }),
      evaluatedTrial({ playedAt: 1_700_000_002_000 }),
    ];

    const [summary] = deriveLevelRuns(trials);
    expect(summary.playedAt).toBe(1_700_000_003_000);
  });
});

describe("buildSyncResponsePlan", () => {
  it("returns nothing to fetch and an unchanged cursor when the log has no new entries", () => {
    const plan = buildSyncResponsePlan([], 10, new Set(), new Set());
    expect(plan).toEqual({ trialIdsToFetch: [], levelRunIdsToFetch: [], newCursor: 10 });
  });

  it("splits log entries by entity_type into the ids to fetch", () => {
    const log = [
      { seq: 11, entityType: "trial_result" as const, entityId: "t-1" },
      { seq: 12, entityType: "level_run" as const, entityId: "r-1" },
    ];
    const plan = buildSyncResponsePlan(log, 10, new Set(), new Set());
    expect(plan).toEqual({ trialIdsToFetch: ["t-1"], levelRunIdsToFetch: ["r-1"], newCursor: 12 });
  });

  it("advances the cursor to the max seq seen, even for excluded entries", () => {
    const log = [{ seq: 11, entityType: "trial_result" as const, entityId: "t-1" }];
    const plan = buildSyncResponsePlan(log, 10, new Set(["t-1"]), new Set());
    expect(plan.newCursor).toBe(11);
  });

  it("excludes trial ids the caller says it just pushed itself", () => {
    const log = [
      { seq: 11, entityType: "trial_result" as const, entityId: "t-1" },
      { seq: 12, entityType: "trial_result" as const, entityId: "t-2" },
    ];
    const plan = buildSyncResponsePlan(log, 10, new Set(["t-1"]), new Set());
    expect(plan.trialIdsToFetch).toEqual(["t-2"]);
  });

  it("excludes level run ids the caller says it just pushed itself", () => {
    const log = [
      { seq: 11, entityType: "level_run" as const, entityId: "r-1" },
      { seq: 12, entityType: "level_run" as const, entityId: "r-2" },
    ];
    const plan = buildSyncResponsePlan(log, 10, new Set(), new Set(["r-1"]));
    expect(plan.levelRunIdsToFetch).toEqual(["r-2"]);
  });
});
