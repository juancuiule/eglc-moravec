import type { DatabaseSync } from "node:sqlite";
import { LEVEL_SEED_DATA } from "./seedData.js";

export function seedLevelsIfEmpty(db: DatabaseSync): void {
  const { count } = db.prepare("SELECT COUNT(*) as count FROM levels").get() as { count: number };
  if (count > 0) return;

  const insert = db.prepare("INSERT INTO levels (level_number, mix) VALUES (?, ?)");
  Object.entries(LEVEL_SEED_DATA).forEach(([levelNumber, mix]) => {
    insert.run(Number(levelNumber), JSON.stringify(mix));
  });
}

export function getLevelNumbers(db: DatabaseSync): number[] {
  const rows = db.prepare("SELECT level_number FROM levels ORDER BY level_number").all() as {
    level_number: number;
  }[];
  return rows.map((r) => r.level_number);
}

export function getLevelMix(db: DatabaseSync, levelNumber: number): Record<string, number> | null {
  const row = db.prepare("SELECT mix FROM levels WHERE level_number = ?").get(levelNumber) as
    | { mix: string }
    | undefined;
  return row ? JSON.parse(row.mix) : null;
}
