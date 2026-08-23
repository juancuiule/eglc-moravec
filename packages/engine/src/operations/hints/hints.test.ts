import { describe, it, expect } from "vitest";
import { NoHint } from "./NoHint";
import { MultiplicationHint } from "./MultiplicationHint";
import { SquaringHint } from "./SquaringHint";

describe("NoHint", () => {
  it("hasHint returns false", () => {
    expect(new NoHint().hasHint()).toBe(false);
  });

  it("getSteps returns empty array", () => {
    expect(new NoHint().getSteps()).toEqual([]);
  });
});

describe("MultiplicationHint", () => {
  it("hasHint returns true", () => {
    expect(new MultiplicationHint(23, 4).hasHint()).toBe(true);
  });

  it("produces correct steps for 23 × 4", () => {
    const steps = new MultiplicationHint(23, 4).getSteps();
    expect(steps).toContain("23 × 4");
    expect(steps).toContain("= (20 + 3) × 4");
    expect(steps).toContain("= 20×4 + 3×4");
  });

  it("produces correct steps for 234 × 5", () => {
    const steps = new MultiplicationHint(234, 5).getSteps();
    expect(steps).toContain("= (200 + 30 + 4) × 5");
  });

  it("does not reveal the final answer", () => {
    for (const [l, r] of [[7, 8], [23, 6], [123, 4], [2345, 3]] as const) {
      const steps = new MultiplicationHint(l, r).getSteps();
      expect(steps.join(" ")).not.toContain(String(l * r));
    }
  });
});

describe("SquaringHint", () => {
  it("hasHint returns true", () => {
    expect(new SquaringHint(23).hasHint()).toBe(true);
  });

  it("first step shows the algebraic identity for 23²", () => {
    const steps = new SquaringHint(23).getSteps();
    // step[0]: "23² = (23−3)(23+3) + 3²"
    expect(steps[0]).toContain("23²");
    // step[1]: "= 20 × 26 + 9"
    expect(steps[1]).toContain("20");
    expect(steps[1]).toContain("26");
  });

  it("rounds up when remainder > 5 (e.g. 47 → 50)", () => {
    const steps = new SquaringHint(47).getSteps();
    // a = 47%10 = 7 → rounds up → a = -3, so (47+3)(47-3) = 50 × 44
    expect(steps[1]).toContain("50");
    expect(steps[1]).toContain("44");
  });

  it("does not reveal the final answer", () => {
    for (const x of [11, 23, 47, 99, 123]) {
      const steps = new SquaringHint(x).getSteps();
      expect(steps.join(" ")).not.toContain(String(x * x));
    }
  });
});

describe("Operation.hint() integration", () => {
  it("Addition returns NoHint", async () => {
    const { Addition } = await import("../operation.js");
    const { categoryFromCodename } = await import("../category.js");
    const cat = categoryFromCodename("1d+1d");
    const op = Addition.create(cat as Parameters<typeof Addition.create>[0]);
    expect(op.hint().hasHint()).toBe(false);
  });

  it("Multiplication returns MultiplicationHint", async () => {
    const { Multiplication } = await import("../operation.js");
    const { categoryFromCodename } = await import("../category.js");
    const cat = categoryFromCodename("2dx1d");
    const op = Multiplication.create(cat as Parameters<typeof Multiplication.create>[0]);
    expect(op.hint().hasHint()).toBe(true);
    expect(op.hint().getSteps().length).toBeGreaterThan(0);
  });

  it("Squaring returns SquaringHint", async () => {
    const { Squaring } = await import("../operation.js");
    const { categoryFromCodename } = await import("../category.js");
    const cat = categoryFromCodename("(2d)^2");
    const op = Squaring.create(cat as Parameters<typeof Squaring.create>[0]);
    expect(op.hint().hasHint()).toBe(true);
    expect(op.hint().getSteps().length).toBeGreaterThan(0);
  });
});
