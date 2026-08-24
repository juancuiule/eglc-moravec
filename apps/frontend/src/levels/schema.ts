import type { RxJsonSchema } from "rxdb";

export type LevelDocType = {
  /** RxDB primary keys must be strings — the backend's numeric levelNumber, stringified. */
  levelNumber: string;
  mix: Record<string, number>;
};

export const levelSchema: RxJsonSchema<LevelDocType> = {
  title: "level",
  version: 0,
  primaryKey: "levelNumber",
  type: "object",
  properties: {
    levelNumber: { type: "string", maxLength: 20 },
    mix: { type: "object" },
  },
  required: ["levelNumber", "mix"],
};
