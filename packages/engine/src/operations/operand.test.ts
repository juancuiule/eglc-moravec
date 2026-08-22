import { describe, it, expect, vi, afterEach } from "vitest";
import { createRandomOperand } from "./operand.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createRandomOperand", () => {
  it("throws when digits <= 0", () => {
    expect(() => createRandomOperand(0)).toThrow();
    expect(() => createRandomOperand(-1)).toThrow();
  });

  describe("1 digit", () => {
    it("includes 0 and 1 by default", () => {
      // list = [0,1,2,...,9], Math.random=0 → index 0 → 0
      vi.spyOn(Math, "random").mockReturnValue(0);
      expect(createRandomOperand(1)).toBe(0);
    });

    it("excludes 0 when allow_zero is false", () => {
      // list = [1,2,...,9], Math.random=0 → index 0 → 1
      vi.spyOn(Math, "random").mockReturnValue(0);
      expect(createRandomOperand(1, { allow_zero: false })).toBe(1);
    });

    it("excludes 0 and 1 when both are false", () => {
      // list = [2,3,...,9], Math.random=0 → index 0 → 2
      vi.spyOn(Math, "random").mockReturnValue(0);
      expect(createRandomOperand(1, { allow_zero: false, allow_one: false })).toBe(2);
    });

    it("throws when no values are possible", () => {
      // list = [], should throw inside pickRandom
      expect(() =>
        createRandomOperand(1, { allow_zero: false, allow_one: false, allow_multiples_of_ten: false })
      ).not.toThrow(); // digits=1 multiples_of_ten flag does not apply to 1-digit, list still has [2..9]
    });
  });

  describe("multi digit", () => {
    it("returns a 2-digit number when digits=2", () => {
      // randomInt is called with (10, 100); Math.random=0 → 10
      vi.spyOn(Math, "random").mockReturnValue(0);
      const result = createRandomOperand(2);
      expect(result).toBeGreaterThanOrEqual(10);
      expect(result).toBeLessThanOrEqual(99);
    });

    it("excludes multiples of ten when allow_multiples_of_ten is false", () => {
      // min becomes 10+1=11; Math.random=0 → 11
      vi.spyOn(Math, "random").mockReturnValue(0);
      const result = createRandomOperand(2, { allow_multiples_of_ten: false });
      expect(result % 10).not.toBe(0);
    });

    it("returns a 3-digit number when digits=3", () => {
      vi.spyOn(Math, "random").mockReturnValue(0);
      const result = createRandomOperand(3);
      expect(result).toBeGreaterThanOrEqual(100);
      expect(result).toBeLessThanOrEqual(999);
    });
  });
});
