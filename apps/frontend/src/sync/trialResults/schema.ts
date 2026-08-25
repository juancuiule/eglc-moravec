import type { RxJsonSchema } from "rxdb";
import type { Keystroke } from "engine";

/**
 * `clientCorrect`/`clientTimeExceeded` are the player's own claim at the
 * moment of scoring — immutable, kept forever for auditing, mirroring the
 * backend's `trial_results.client_correct`/`client_time_exceeded` columns.
 * `correct`/`timeExceeded` start out equal to that claim (so unlock-gating
 * and stats work immediately, offline) and the backend may overwrite them
 * with its own independently-recomputed values once this trial has synced.
 */
export type TrialResultDocType = {
  id: string;
  levelNumber: number;
  categoryCodename: string;
  operands: number[];
  answer: number | null;
  timeTaken: number;
  playedAt: number;
  keystrokes: Keystroke[];
  hintShown: boolean;
  streakAtSubmit: number;
  hintsAvailableAtStart: number;
  levelRunId: string;
  clientCorrect: boolean;
  clientTimeExceeded: boolean;
  correct: boolean;
  timeExceeded: boolean;
};

export const trialResultSchema: RxJsonSchema<TrialResultDocType> = {
  title: "trialResult",
  version: 0,
  primaryKey: "id",
  type: "object",
  properties: {
    id: { type: "string", maxLength: 40 },
    levelNumber: { type: "number" },
    categoryCodename: { type: "string" },
    operands: { type: "array", items: { type: "number" } },
    answer: { type: ["number", "null"] },
    timeTaken: { type: "number" },
    playedAt: { type: "number" },
    keystrokes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          key: { type: "string" },
          t: { type: "number" },
        },
        required: ["key", "t"],
      },
    },
    hintShown: { type: "boolean" },
    streakAtSubmit: { type: "number" },
    hintsAvailableAtStart: { type: "number" },
    levelRunId: { type: "string" },
    clientCorrect: { type: "boolean" },
    clientTimeExceeded: { type: "boolean" },
    correct: { type: "boolean" },
    timeExceeded: { type: "boolean" },
  },
  required: [
    "id",
    "levelNumber",
    "categoryCodename",
    "operands",
    "answer",
    "timeTaken",
    "playedAt",
    "keystrokes",
    "hintShown",
    "streakAtSubmit",
    "hintsAvailableAtStart",
    "levelRunId",
    "clientCorrect",
    "clientTimeExceeded",
    "correct",
    "timeExceeded",
  ],
};
