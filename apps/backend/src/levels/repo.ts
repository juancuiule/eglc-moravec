import type { DatabaseSync } from "node:sqlite";
import { LEVEL_SEED_DATA } from "./seedData.js";

/**
 * Populates `levels` from the seed fixture, but only on a fresh database —
 * once seeded, the table is the live source of truth and this is a no-op,
 * even if the seed fixture itself changes later (that's the whole point of
 * moving the catalog server-side: content changes without a redeploy).
 */
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

/** Every Level's mix in one query — the whole catalog, for a client warming its offline cache rather than reading one Level at a time. */
export function getAllLevels(db: DatabaseSync): { levelNumber: number; mix: Record<string, number> }[] {
  const rows = db.prepare("SELECT level_number, mix FROM levels ORDER BY level_number").all() as {
    level_number: number;
    mix: string;
  }[];
  return rows.map((r) => ({ levelNumber: r.level_number, mix: JSON.parse(r.mix) }));
}
