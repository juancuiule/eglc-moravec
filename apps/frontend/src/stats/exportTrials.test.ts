import { describe, expect, it } from "vitest";
import type { SyncedTrial } from "../api/Api";
import { exportFilename, trialsToCsv, trialsToJson } from "./exportTrials";

const trial: SyncedTrial = {
  id: "11111111-1111-4111-8111-111111111111",
  levelNumber: 5,
  categoryCodename: "2dx1d",
  operands: [12, 5],
  answer: 60,
  correct: true,
  timeExceeded: false,
  timeTaken: 3400,
  playedAt: Date.UTC(2023, 10, 14, 22, 13, 20),
  hintShown: true,
  runType: "level",
  runId: "22222222-2222-4222-8222-222222222222",
};

const practiceTrial: SyncedTrial = {
  ...trial,
  id: "33333333-3333-4333-8333-333333333333",
  levelNumber: null,
  answer: null,
  correct: false,
  timeExceeded: true,
  runType: "practice",
};

describe("trialsToCsv", () => {
  it("emits a stable header and one row per trial", () => {
    const lines = trialsToCsv([trial, practiceTrial]).trimEnd().split("\n");
    expect(lines[0]).toBe(
      "id,played_at,level_number,run_type,run_id,category_codename,operands,answer,correct,time_exceeded,time_taken_ms,hint_shown",
    );
    expect(lines).toHaveLength(3);
  });

  it("writes ISO timestamps, JSON-quoted operands, and empty cells for nulls", () => {
    const rows = trialsToCsv([trial, practiceTrial]).trimEnd().split("\n");
    expect(rows[1]).toContain("2023-11-14T22:13:20.000Z");
    expect(rows[1]).toContain('"[12,5]"'); // quoted — contains a comma
    expect(rows[1]).toContain(",5,"); // level_number
    expect(rows[2]).toContain("practice");
    // null level_number and null answer render as empty cells, never "null"
    expect(rows[2]).not.toContain("null");
  });
});

describe("trialsToJson", () => {
  it("round-trips the exact SyncedTrial payload", () => {
    expect(JSON.parse(trialsToJson([trial, practiceTrial]))).toEqual([
      trial,
      practiceTrial,
    ]);
  });
});

describe("exportFilename", () => {
  it("names the file after the export date", () => {
    expect(exportFilename("csv", new Date(Date.UTC(2026, 7, 28)))).toBe(
      "moravec-trials-2026-08-28.csv",
    );
    expect(exportFilename("json", new Date(Date.UTC(2026, 7, 28)))).toBe(
      "moravec-trials-2026-08-28.json",
    );
  });
});
