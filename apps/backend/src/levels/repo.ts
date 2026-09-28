import type { DatabaseSync } from "node:sqlite";
import { isSupportedCategoryCodename } from "engine";
import { LEVEL_SEED_DATA } from "./seedData.js";

export function seedLevelsIfEmpty(db: DatabaseSync): void {
  const { count } = db
    .prepare("SELECT COUNT(*) as count FROM levels")
    .get() as { count: number };
  if (count > 0) return;

  const insert = db.prepare(
    "INSERT INTO levels (level_number, mix) VALUES (?, ?)",
  );
  Object.entries(LEVEL_SEED_DATA).forEach(([levelNumber, mix]) => {
    insert.run(Number(levelNumber), JSON.stringify(mix));
  });
}

// The catalog is authoritative for navigation, so a malformed one must never
// boot: unlock math assumes the previous level is `n - 1`, which only holds
// when numbers are contiguous from 1. Gaps or a missing Level 1 are operator
// errors to fix in the `levels` table — never renumbered or repaired here.
export function assertLevelsAreContiguous(db: DatabaseSync): void {
  const numbers = getLevelNumbers(db);
  if (numbers.length === 0) {
    throw new Error("Level catalog is empty");
  }
  numbers.forEach((n, i) => {
    const expected = i + 1;
    if (n !== expected) {
      throw new Error(
        `Level catalog is invalid: expected level ${expected}, found ${n} — levels must be contiguous starting at 1`,
      );
    }
  });
}

// Every mix must reference only currently-playable categories and carry at
// least one positive weight — a typo'd or retired codename, or an all-zero
// mix, otherwise throws mid-play inside pickRandomWeighted/createOperation.
// Checked at boot: the catalog is operator data, so a bad row fails loudly
// on deploy instead of in a player's session.
export function assertLevelMixesAreValid(db: DatabaseSync): void {
  const rows = db.prepare("SELECT level_number, mix FROM levels").all() as {
    level_number: number;
    mix: string;
  }[];
  rows.forEach(({ level_number, mix }) => {
    const parsed: unknown = JSON.parse(mix);
    const entries =
      typeof parsed === "object" && parsed !== null
        ? Object.entries(parsed)
        : [];
    const invalid = entries.some(
      ([codename, weight]) =>
        !isSupportedCategoryCodename(codename) ||
        typeof weight !== "number" ||
        !Number.isFinite(weight),
    );
    const totalWeight = entries.reduce(
      (sum, [, weight]) => sum + (weight as number),
      0,
    );
    if (entries.length === 0 || invalid || totalWeight <= 0) {
      throw new Error(
        `Level ${level_number} mix is invalid: every category codename must be supported and at least one weight positive`,
      );
    }
  });
}

export function getLevelNumbers(db: DatabaseSync): number[] {
  const rows = db
    .prepare("SELECT level_number FROM levels ORDER BY level_number")
    .all() as {
    level_number: number;
  }[];
  return rows.map((r) => r.level_number);
}

export function getLevelMix(
  db: DatabaseSync,
  levelNumber: number,
): Record<string, number> | null {
  const row = db
    .prepare("SELECT mix FROM levels WHERE level_number = ?")
    .get(levelNumber) as { mix: string } | undefined;
  return row ? JSON.parse(row.mix) : null;
}
