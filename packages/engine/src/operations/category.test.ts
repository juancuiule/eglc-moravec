import { describe, it, expect } from "vitest";
import { categoryFromCodename } from "./category";

describe("categoryFromCodename", () => {
  it("parses addition codenames", () => {
    expect(categoryFromCodename("1d+1d")).toEqual({
      type: "addition",
      codename: "1d+1d",
      lDigits: 1,
      rDigits: 1,
    });
    expect(categoryFromCodename("2d+2d")).toEqual({
      type: "addition",
      codename: "2d+2d",
      lDigits: 2,
      rDigits: 2,
    });
  });

  it("parses multiplication codenames", () => {
    expect(categoryFromCodename("1dx1d")).toEqual({
      type: "multiplication",
      codename: "1dx1d",
      lDigits: 1,
      rDigits: 1,
    });
    expect(categoryFromCodename("3dx1d")).toEqual({
      type: "multiplication",
      codename: "3dx1d",
      lDigits: 3,
      rDigits: 1,
    });
  });

  it("parses squaring codenames", () => {
    expect(categoryFromCodename("(2d)^2")).toEqual({
      type: "squaring",
      codename: "(2d)^2",
      digits: 2,
    });
    expect(categoryFromCodename("(4d)^2")).toEqual({
      type: "squaring",
      codename: "(4d)^2",
      digits: 4,
    });
  });

  it("throws on unknown codename", () => {
    expect(() => categoryFromCodename("unknown")).toThrow();
    expect(() => categoryFromCodename("1d*1d")).toThrow();
  });
});
