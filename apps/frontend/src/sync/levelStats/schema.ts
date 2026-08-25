import type { RxJsonSchema } from "rxdb";

/**
 * Pull-only from the backend's perspective — the client never pushes a
 * candidate as an assertion the server has to trust. The one exception is
 * a plain *local* write the moment a Level finishes (see optimisticWrite.ts),
 * done directly against this collection, outside of replication entirely,
 * so unlock-gating keeps working with zero network. That optimistic guess
 * is overwritten by the next pull once the corresponding Trial-results push
 * (see ../trialResults) confirms — whether that's the same value, a
 * correction, or a better value pulled in from another device.
 */
export type LevelStatsDocType = {
  levelNumber: string;
  stars: number;
  totalTime: number;
  completedAt: number;
};

export const levelStatsSchema: RxJsonSchema<LevelStatsDocType> = {
  title: "levelStats",
  version: 0,
  primaryKey: "levelNumber",
  type: "object",
  properties: {
    levelNumber: { type: "string", maxLength: 20 },
    stars: { type: "number" },
    totalTime: { type: "number" },
    completedAt: { type: "number" },
  },
  required: ["levelNumber", "stars", "totalTime", "completedAt"],
};
