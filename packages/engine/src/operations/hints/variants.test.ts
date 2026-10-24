import { describe, expect, it } from "vitest";
import type { OperationCategory } from "../category";
import {
  assignHintVariant,
  HINT_VARIANTS,
  hintBucket,
  isRegisteredHintVariant,
} from "./variants";

type OperationType = OperationCategory["type"];

function range(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

// Every operand tuple the playable categories can draw, per operation type.
const OPERAND_SWEEP: Record<OperationType, number[][]> = {
  addition: [
    ...range(0, 9).flatMap((l) => range(0, 9).map((r) => [l, r])),
    ...range(10, 99).flatMap((l) => range(10, 99).map((r) => [l, r])),
  ],
  multiplication: range(2, 9999).flatMap((l) => range(2, 9).map((r) => [l, r])),
  squaring: range(0, 9999).map((x) => [x]),
};

function answerOf(type: OperationType, operands: number[]): number {
  const [a, b] = operands;
  if (type === "addition") return a + b;
  if (type === "multiplication") return a * b;
  return a * a;
}

// Evaluates one side of a step, e.g. "(27−3)(27+3) + 3²" or "20×4 + 7×4".
function evaluate(expression: string): number {
  const tokens = expression.match(/\d+|[+−×²()]/g) ?? [];
  let i = 0;
  const sum = (): number => {
    let value = product();
    while (tokens[i] === "+" || tokens[i] === "−") {
      const sign = tokens[i++] === "+" ? 1 : -1;
      value += sign * product();
    }
    return value;
  };
  const product = (): number => {
    let value = power();
    while (tokens[i] === "×" || tokens[i] === "(") {
      if (tokens[i] === "×") i++;
      value *= power();
    }
    return value;
  };
  const power = (): number => {
    const base = tokens[i] === "(" ? (i++, sum()) : Number(tokens[i]);
    i++;
    if (tokens[i] === "²") {
      i++;
      return base * base;
    }
    return base;
  };
  const value = sum();
  if (i !== tokens.length) throw new Error(`Unparsed: ${expression}`);
  return value;
}

const cases = (Object.keys(HINT_VARIANTS) as OperationType[]).flatMap((type) =>
  HINT_VARIANTS[type].map((variant) => ({ type, variant })),
);

describe("every registered hint variant", () => {
  it.each(cases)(
    "$variant.id never shows the final answer as a number in any step",
    ({ type, variant }) => {
      const leaks: string[] = [];
      for (const operands of OPERAND_SWEEP[type]) {
        const hint = variant.build(operands);
        if (!hint.hasHint()) continue;
        const answer = String(answerOf(type, operands));
        for (const step of hint.getSteps()) {
          if (step.match(/\d+/g)?.includes(answer)) {
            leaks.push(`${operands.join(",")}: ${step}`);
          }
        }
      }
      expect(leaks.slice(0, 5)).toEqual([]);
    },
  );

  it.each(cases)(
    "$variant.id keeps every step equal to the answer",
    ({ type, variant }) => {
      const wrong: string[] = [];
      for (const operands of OPERAND_SWEEP[type]) {
        const hint = variant.build(operands);
        if (!hint.hasHint()) continue;
        const answer = answerOf(type, operands);
        for (const step of hint.getSteps()) {
          for (const side of step.split("=").filter((s) => s.trim() !== "")) {
            if (evaluate(side) !== answer) {
              wrong.push(`${operands.join(",")}: ${step}`);
            }
          }
        }
      }
      expect(wrong.slice(0, 5)).toEqual([]);
    },
  );

  it.each(cases)(
    "$variant.id shows no steps when it has no hint",
    ({ type, variant }) => {
      for (const operands of OPERAND_SWEEP[type]) {
        const hint = variant.build(operands);
        if (!hint.hasHint()) expect(hint.getSteps()).toEqual([]);
      }
    },
  );
});

describe("variants of one operation type", () => {
  it.each(Object.keys(HINT_VARIANTS) as OperationType[])(
    "%s variants all show the same number of steps, so card height can't tell them apart",
    (type) => {
      const counts = new Set<number>();
      for (const variant of HINT_VARIANTS[type]) {
        for (const operands of OPERAND_SWEEP[type]) {
          const hint = variant.build(operands);
          if (hint.hasHint()) counts.add(hint.getSteps().length);
        }
      }
      expect(counts.size).toBe(1);
    },
  );
});

describe("existing hints as the first variant of each type", () => {
  it("registers add-decompose, add-complement, mult-decompose and sq-diff", () => {
    expect(HINT_VARIANTS.addition.map((v) => v.id)).toEqual([
      "add-decompose",
      "add-complement",
    ]);
    expect(HINT_VARIANTS.multiplication.map((v) => v.id)).toEqual([
      "mult-decompose",
    ]);
    expect(HINT_VARIANTS.squaring.map((v) => v.id)).toEqual(["sq-diff"]);
  });

  it("mult-decompose offers no hint for 1dx1d facts", () => {
    expect(HINT_VARIANTS.multiplication[0].build([7, 8]).hasHint()).toBe(false);
  });
});

describe("add-complement", () => {
  const complement = HINT_VARIANTS.addition[1];

  it("completes the left operand to the next ten and takes the difference from the right", () => {
    expect(complement.build([47, 35]).getSteps()).toEqual([
      "47 + 35",
      "= (47 + 3) + (35 − 3)",
      "= 50 + 32",
    ]);
  });

  it("offers no hint when the left operand is already round or one digit", () => {
    for (const operands of [
      [40, 35],
      [4, 7],
    ]) {
      expect(complement.build(operands).hasHint()).toBe(false);
    }
  });
});

describe("assignHintVariant", () => {
  const seeds = range(1, 1000).map((i) => `player-${i}@example.com`);

  it("always gives the same seed the same addition variant", () => {
    for (const seed of seeds.slice(0, 50)) {
      expect(assignHintVariant(seed, "addition")).toBe(
        assignHintVariant(seed, "addition"),
      );
    }
  });

  // Pinned outputs: changing the hash, its input, or the registry order
  // reassigns every player mid-experiment, so it must fail here first.
  it("keeps today's assignments", () => {
    expect(
      ["a", "player@example.com", "device-123"].map((seed) =>
        assignHintVariant(seed, "addition"),
      ),
    ).toMatchInlineSnapshot(`
      [
        "add-complement",
        "add-complement",
        "add-decompose",
      ]
    `);
  });

  it("splits players roughly evenly between the two addition variants", () => {
    const complement = seeds.filter(
      (seed) => assignHintVariant(seed, "addition") === "add-complement",
    ).length;
    expect(complement).toBeGreaterThan(420);
    expect(complement).toBeLessThan(580);
  });

  it("assigns nothing for a type with a single variant", () => {
    expect(assignHintVariant("player@example.com", "multiplication")).toBe(
      null,
    );
    expect(assignHintVariant("player@example.com", "squaring")).toBe(null);
  });
});

describe("hintBucket", () => {
  const deviceIds = Array.from({ length: 5000 }, () => crypto.randomUUID());
  const types: OperationType[] = ["addition", "multiplication", "squaring"];

  it.each(types)("splits %s roughly evenly over two variants", (type) => {
    const second = deviceIds.filter((id) => hintBucket(id, type, 2) === 1);
    expect(second.length / deviceIds.length).toBeGreaterThan(0.47);
    expect(second.length / deviceIds.length).toBeLessThan(0.53);
  });

  it.each([
    ["addition", "multiplication"],
    ["addition", "squaring"],
    ["multiplication", "squaring"],
  ] as const)(
    "draws %s and %s independently, so one bucket says nothing about the other",
    (a, b) => {
      const agree = deviceIds.filter(
        (id) => hintBucket(id, a, 2) === hintBucket(id, b, 2),
      );
      expect(agree.length / deviceIds.length).toBeGreaterThan(0.47);
      expect(agree.length / deviceIds.length).toBeLessThan(0.53);
    },
  );
});

describe("HINT_VARIANTS", () => {
  it("can't be changed at runtime", () => {
    expect(() => {
      (HINT_VARIANTS as Record<string, unknown>).squaring = [];
    }).toThrow(TypeError);
    expect(() => {
      (HINT_VARIANTS.addition as unknown as unknown[]).reverse();
    }).toThrow(TypeError);
    expect(HINT_VARIANTS.addition.map((v) => v.id)).toEqual([
      "add-decompose",
      "add-complement",
    ]);
  });
});

describe("isRegisteredHintVariant", () => {
  it("accepts a variant registered for the category's operation type", () => {
    expect(isRegisteredHintVariant("2d+2d", "add-complement")).toBe(true);
    expect(isRegisteredHintVariant("1d+1d", "add-decompose")).toBe(true);
    expect(isRegisteredHintVariant("2dx1d", "mult-decompose")).toBe(true);
    expect(isRegisteredHintVariant("(3d)^2", "sq-diff")).toBe(true);
  });

  it("rejects unknown ids, another type's ids and unsupported categories", () => {
    expect(isRegisteredHintVariant("2d+2d", "add-dots")).toBe(false);
    expect(isRegisteredHintVariant("2d+2d", "sq-diff")).toBe(false);
    expect(isRegisteredHintVariant("2dx1d", "add-complement")).toBe(false);
    expect(isRegisteredHintVariant("5d+5d", "add-decompose")).toBe(false);
  });
});
