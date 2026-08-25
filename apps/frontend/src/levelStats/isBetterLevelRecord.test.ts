import { expect, test } from "vitest";
import { isBetterLevelRecord } from "./isBetterLevelRecord";

test("accepts anything when there's no existing record", () => {
  expect(isBetterLevelRecord({ stars: 0, totalTime: 999_999 }, null)).toBe(true);
});

test("accepts more stars", () => {
  expect(isBetterLevelRecord({ stars: 2, totalTime: 20000 }, { stars: 1, totalTime: 10000 })).toBe(true);
});

test("rejects fewer stars even with a better time", () => {
  expect(isBetterLevelRecord({ stars: 1, totalTime: 5000 }, { stars: 2, totalTime: 20000 })).toBe(false);
});

test("accepts the same stars with a better time", () => {
  expect(isBetterLevelRecord({ stars: 2, totalTime: 9000 }, { stars: 2, totalTime: 10000 })).toBe(true);
});

test("rejects the same stars with a worse time", () => {
  expect(isBetterLevelRecord({ stars: 2, totalTime: 12000 }, { stars: 2, totalTime: 10000 })).toBe(false);
});
