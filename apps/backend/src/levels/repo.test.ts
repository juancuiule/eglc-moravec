import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, it, expect } from "vitest";
import { openDb } from "../db.js";
import {
  assertLevelsAreContiguous,
  getLevelNumbers,
  getLevelMix,
} from "./repo.js";

const tempDirs: string[] = [];
afterEach(() => {
  tempDirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true }));
});

function tamperedDb(mutate: (db: DatabaseSync) => void): string {
  const dir = mkdtempSync(join(tmpdir(), "moravec-levels-"));
  tempDirs.push(dir);
  const path = join(dir, "test.db");
  openDb(path).close();
  const db = new DatabaseSync(path);
  mutate(db);
  db.close();
  return path;
}

describe("getLevelNumbers", () => {
  it("returns every seeded level number, in order", () => {
    const db = openDb(":memory:");
    const numbers = getLevelNumbers(db);
    expect(numbers).toHaveLength(150);
    expect(numbers[0]).toBe(1);
    expect(numbers[numbers.length - 1]).toBe(150);
    expect(numbers).toEqual([...numbers].sort((a, b) => a - b));
  });
});

describe("getLevelMix", () => {
  it("returns the parsed mix for a known level", () => {
    const db = openDb(":memory:");
    expect(getLevelMix(db, 1)).toEqual({ "1d+1d": 50, "1dx1d": 50 });
  });

  it("returns null for an unknown level number", () => {
    const db = openDb(":memory:");
    expect(getLevelMix(db, 99999)).toBeNull();
  });
});

describe("assertLevelsAreContiguous", () => {
  it("accepts the seeded catalog", () => {
    expect(() => assertLevelsAreContiguous(openDb(":memory:"))).not.toThrow();
  });

  it("accepts a contiguous catalog of any length", () => {
    const db = openDb(":memory:");
    db.exec("DELETE FROM levels");
    db.exec(
      "INSERT INTO levels (level_number, mix) VALUES (1, '{}'), (2, '{}'), (3, '{}')",
    );
    expect(() => assertLevelsAreContiguous(db)).not.toThrow();
  });

  it("rejects a catalog missing level 1", () => {
    const db = openDb(":memory:");
    db.exec("DELETE FROM levels WHERE level_number = 1");
    expect(() => assertLevelsAreContiguous(db)).toThrow(/expected level 1/);
  });

  it("rejects a catalog with a gap", () => {
    const db = openDb(":memory:");
    db.exec("DELETE FROM levels WHERE level_number = 4");
    expect(() => assertLevelsAreContiguous(db)).toThrow(
      /expected level 4, found 5/,
    );
  });

  it("rejects a non-positive level number", () => {
    const db = openDb(":memory:");
    db.exec("DELETE FROM levels");
    db.exec(
      "INSERT INTO levels (level_number, mix) VALUES (0, '{}'), (1, '{}'), (2, '{}')",
    );
    expect(() => assertLevelsAreContiguous(db)).toThrow(
      /expected level 1, found 0/,
    );
  });
});

describe("openDb catalog validation", () => {
  it("refuses to open a database whose catalog has a gap", () => {
    const path = tamperedDb((db) =>
      db.exec("DELETE FROM levels WHERE level_number = 4"),
    );
    expect(() => openDb(path)).toThrow(
      /expected level 4, found 5.*contiguous starting at 1/,
    );
  });

  it("refuses to open a database whose catalog is missing level 1", () => {
    const path = tamperedDb((db) =>
      db.exec("DELETE FROM levels WHERE level_number = 1"),
    );
    expect(() => openDb(path)).toThrow(/expected level 1, found 2/);
  });

  it("keeps opening a valid pre-existing catalog of a different length", () => {
    const path = tamperedDb((db) => {
      db.exec("DELETE FROM levels WHERE level_number > 2");
    });
    const db = openDb(path);
    expect(getLevelNumbers(db)).toEqual([1, 2]);
    db.close();
  });
});
