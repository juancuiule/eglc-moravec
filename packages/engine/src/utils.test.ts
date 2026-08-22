import { describe, it, expect, vi, afterEach } from "vitest";
import { math, getKeys, getValues } from "./utils.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("math.pickRandom", () => {
  it("throws on empty list", () => {
    expect(() => math.pickRandom([])).toThrow();
  });

  it("returns the only element in a single-item list", () => {
    expect(math.pickRandom([42])).toBe(42);
  });

  it("picks based on Math.random index", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    // floor(0.5 * 3) = 1 → "b"
    expect(math.pickRandom(["a", "b", "c"])).toBe("b");
  });
});

describe("math.pickRandomWeighted", () => {
  it("throws on empty list", () => {
    expect(() => math.pickRandomWeighted([], [])).toThrow();
  });

  it("throws when lengths differ", () => {
    expect(() => math.pickRandomWeighted([1, 2], [1])).toThrow();
  });

  it("throws when total weight is zero", () => {
    expect(() => math.pickRandomWeighted([1], [0])).toThrow();
  });

  it("picks first item when random is 0", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect(math.pickRandomWeighted(["a", "b"], [50, 50])).toBe("a");
  });

  it("picks last item when random is near 1", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.999);
    expect(math.pickRandomWeighted(["a", "b"], [50, 50])).toBe("b");
  });
});

describe("math.randomInt", () => {
  it("throws when min > max", () => {
    expect(() => math.randomInt(5, 3)).toThrow();
  });

  it("returns min when min equals max", () => {
    expect(math.randomInt(7, 7)).toBe(7);
  });

  it("returns min when Math.random is 0", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect(math.randomInt(3, 7)).toBe(3);
  });

  it("returns max when Math.random is near 1", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.999);
    expect(math.randomInt(3, 7)).toBe(7);
  });
});

describe("math.sumBy", () => {
  it("returns 0 for empty list", () => {
    expect(math.sumBy([], (x) => x as number)).toBe(0);
  });

  it("sums by extractor function", () => {
    expect(math.sumBy([{ v: 1 }, { v: 2 }, { v: 3 }], (x) => x.v)).toBe(6);
  });
});

describe("math.sum", () => {
  it("returns 0 for empty list", () => {
    expect(math.sum([])).toBe(0);
  });

  it("sums numbers", () => {
    expect(math.sum([1, 2, 3, 4])).toBe(10);
  });
});

describe("getKeys", () => {
  it("returns typed keys of an object", () => {
    expect(getKeys({ a: 1, b: 2 })).toEqual(["a", "b"]);
  });
});

describe("getValues", () => {
  it("returns values of an object", () => {
    expect(getValues({ a: 1, b: 2 })).toEqual([1, 2]);
  });
});
