import { describe, it, expect } from "vitest";
import { createOperation, reconstructOperation } from "./index";
import { Addition, Multiplication, Squaring } from "./operation";
import { assignHintVariant } from "./hints/variants";

describe("createOperation", () => {
  it("creates an Addition for an addition codename", () => {
    expect(createOperation("1d+1d")).toBeInstanceOf(Addition);
  });

  it("creates a Multiplication for a multiplication codename", () => {
    expect(createOperation("1dx1d")).toBeInstanceOf(Multiplication);
  });

  it("creates a Squaring for a squaring codename", () => {
    expect(createOperation("(2d)^2")).toBeInstanceOf(Squaring);
  });

  it("throws for an unknown codename", () => {
    expect(() => createOperation("not-a-codename")).toThrow();
  });
});

describe("reconstructOperation", () => {
  it("rebuilds an Addition with the exact given operands", () => {
    const op = reconstructOperation("1d+1d", [3, 4]);
    expect(op).toBeInstanceOf(Addition);
    expect(op.result()).toBe(7);
    expect(op.operands()).toEqual([3, 4]);
  });

  it("rebuilds a Multiplication with the exact given operands", () => {
    const op = reconstructOperation("2dx1d", [12, 5]);
    expect(op).toBeInstanceOf(Multiplication);
    expect(op.result()).toBe(60);
  });

  it("rebuilds a Squaring with the exact given operand", () => {
    const op = reconstructOperation("(2d)^2", [11]);
    expect(op).toBeInstanceOf(Squaring);
    expect(op.result()).toBe(121);
  });

  it("round-trips: reconstructing from an operation's own operands() reproduces its result()", () => {
    const original = createOperation("3dx1d");
    const rebuilt = reconstructOperation(
      original.categoryCodename(),
      original.operands(),
    );
    expect(rebuilt.result()).toBe(original.result());
  });

  it.each([
    ["1d+1d", [4]],
    ["1d+1d", [4, 5, 6]],
    ["4dx1d", [2, 3]],
    ["(2d)^2", [12, 12]],
    ["(2d)^2", [12.5]],
  ])(
    "throws when %s operands do not match the category shape",
    (codename, operands) => {
      expect(() => reconstructOperation(codename, operands)).toThrow();
    },
  );

  it("reconstructs a one-digit operation containing zero", () => {
    expect(reconstructOperation("1d+1d", [0, 5]).result()).toBe(5);
  });

  it("throws for an unknown codename", () => {
    expect(() => reconstructOperation("not-a-codename", [1, 2])).toThrow();
  });
});

describe("createOperation with a hint seed", () => {
  const seeds = Array.from({ length: 50 }, (_, i) => `seed-${i}`);
  const seedFor = (variant: string) =>
    seeds.find((s) => assignHintVariant(s, "addition") === variant)!;

  it("tags an addition with the seed's assigned variant", () => {
    for (const variant of ["add-decompose", "add-complement"]) {
      expect(createOperation("2d+2d", seedFor(variant)).hintVariant).toBe(
        variant,
      );
      expect(createOperation("1d+1d", seedFor(variant)).hintVariant).toBe(
        variant,
      );
    }
  });

  it("shows the assigned variant's steps", () => {
    const seed = seedFor("add-complement");
    let op = createOperation("2d+2d", seed);
    while (!op.hint().hasHint()) op = createOperation("2d+2d", seed);
    const [left, right] = op.operands();
    const make = 10 - (left % 10);
    expect(op.hint().getSteps()).toEqual([
      `${left} + ${right}`,
      `= (${left} + ${make}) + (${right} − ${make})`,
      `= ${left + make} + ${right - make}`,
    ]);
  });

  it("tags nothing for single-variant types or without a seed", () => {
    expect(createOperation("2dx1d", "seed-0").hintVariant).toBeNull();
    expect(createOperation("(2d)^2", "seed-0").hintVariant).toBeNull();
    expect(createOperation("2d+2d").hintVariant).toBeNull();
    expect(reconstructOperation("2d+2d", [47, 35]).hintVariant).toBeNull();
  });

  it("shows the first variant's steps when untagged", () => {
    expect(reconstructOperation("2d+2d", [47, 35]).hint().getSteps()).toEqual([
      "47 + 35",
      "= 47 + 30 + 5",
      "= 77 + 5",
    ]);
  });
});
