import { describe, it, expect, vi, afterEach } from "vitest";
import { Addition, Multiplication, Squaring } from "./operation";
import { categoryFromCodename } from "./category";
import type { AdditionCategory, MultiplicationCategory, SquaringCategory } from "./category";

afterEach(() => {
  vi.restoreAllMocks();
});

// With Math.random=0, createRandomOperand(1, {allow_zero:false, allow_one:true}) → 1
// With Math.random=0, createRandomOperand(1, {allow_zero:false, allow_one:false}) → 2
// With Math.random=0, createRandomOperand(2, {allow_multiples_of_ten:false}) → 11

describe("Addition", () => {
  const category = categoryFromCodename("1d+1d") as AdditionCategory;

  it("computes result correctly", () => {
    vi.spyOn(Math, "random").mockReturnValue(0); // both operands → 1
    const op = Addition.create(category);
    expect(op.result()).toBe(2); // 1 + 1
  });

  it("formats humanReadable correctly", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const op = Addition.create(category);
    expect(op.humanReadable()).toBe("1 + 1");
  });

  it("returns correct solveTime for 1d+1d", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect(Addition.create(category).solveTime()).toBe(7_000);
  });

  it("returns correct solveTime for 2d+2d", () => {
    const cat2 = categoryFromCodename("2d+2d") as AdditionCategory;
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect(Addition.create(cat2).solveTime()).toBe(11_000);
  });

  it("throws solveTime for unsupported category", () => {
    // Manually construct an unsupported category
    const unsupported: AdditionCategory = { type: "addition", codename: "3d+3d" as AdditionCategory["codename"], lDigits: 3, rDigits: 3 };
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect(() => Addition.create(unsupported).solveTime()).toThrow();
  });
});

describe("Multiplication", () => {
  const category = categoryFromCodename("1dx1d") as MultiplicationCategory;

  it("computes result correctly", () => {
    vi.spyOn(Math, "random").mockReturnValue(0); // both operands → 2 (allow_one=false)
    const op = Multiplication.create(category);
    expect(op.result()).toBe(4); // 2 * 2
  });

  it("formats humanReadable correctly", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const op = Multiplication.create(category);
    expect(op.humanReadable()).toBe("2 x 2");
  });

  it("returns correct solveTime for 1dx1d", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect(Multiplication.create(category).solveTime()).toBe(10_000);
  });

  it("returns correct solveTime for 2dx1d", () => {
    const cat = categoryFromCodename("2dx1d") as MultiplicationCategory;
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect(Multiplication.create(cat).solveTime()).toBe(14_000);
  });

  it("returns correct solveTime for 3dx1d", () => {
    const cat = categoryFromCodename("3dx1d") as MultiplicationCategory;
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect(Multiplication.create(cat).solveTime()).toBe(16_000);
  });

  it("returns correct solveTime for 4dx1d", () => {
    const cat = categoryFromCodename("4dx1d") as MultiplicationCategory;
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect(Multiplication.create(cat).solveTime()).toBe(20_000);
  });
});

describe("Squaring", () => {
  const category = categoryFromCodename("(2d)^2") as SquaringCategory;

  it("computes result correctly", () => {
    // digits=2, allow_multiples_of_ten=false → min=11; Math.random=0 → 11
    vi.spyOn(Math, "random").mockReturnValue(0);
    const op = Squaring.create(category);
    expect(op.result()).toBe(121); // 11^2
  });

  it("formats humanReadable correctly", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const op = Squaring.create(category);
    expect(op.humanReadable()).toBe("11²");
  });

  it("returns correct solveTime for (2d)^2", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect(Squaring.create(category).solveTime()).toBe(16_000);
  });

  it("returns correct solveTime for (3d)^2", () => {
    const cat = categoryFromCodename("(3d)^2") as SquaringCategory;
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect(Squaring.create(cat).solveTime()).toBe(34_000);
  });

  it("returns correct solveTime for (4d)^2", () => {
    const cat = categoryFromCodename("(4d)^2") as SquaringCategory;
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect(Squaring.create(cat).solveTime()).toBe(80_000);
  });
});
