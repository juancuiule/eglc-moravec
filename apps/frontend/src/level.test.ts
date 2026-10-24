import { describe, it, expect, vi, afterEach } from "vitest";
import { createRandomOperation } from "./level";
import { assignHintVariant, Operation } from "engine";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createRandomOperation", () => {
  it("returns an Operation instance", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const op = createRandomOperation({ "1d+1d": 100 }, "seed");
    expect(op).toBeInstanceOf(Operation);
  });

  it("picks the only category in a single-entry level", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const op = createRandomOperation({ "1dx1d": 100 }, "seed");
    // result of 1dx1d with Math.random=0: operand=2, result=4
    expect(op.humanReadable()).toContain("×");
  });

  it("uses addition when level only has addition", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const op = createRandomOperation({ "1d+1d": 100 }, "seed");
    expect(op.humanReadable()).toContain("+");
  });

  it("tags the draw with the hint variant assigned to the seed", () => {
    for (const seed of ["seed-1", "seed-2", "seed-3", "seed-4"]) {
      expect(createRandomOperation({ "2d+2d": 100 }, seed).hintVariant).toBe(
        assignHintVariant(seed, "addition"),
      );
    }
  });

  it("returns an operation with valid result, solveTime, and humanReadable", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const op = createRandomOperation({ "1d+1d": 100 }, "seed");
    expect(typeof op.result()).toBe("number");
    expect(typeof op.solveTime()).toBe("number");
    expect(typeof op.humanReadable()).toBe("string");
  });
});
