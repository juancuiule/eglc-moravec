import { describe, it, expect } from "vitest";
import { createOperation, reconstructOperation } from "./index";
import { Addition, Multiplication, Squaring } from "./operation";

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

  it("throws for an unknown codename", () => {
    expect(() => reconstructOperation("not-a-codename", [1, 2])).toThrow();
  });
});
