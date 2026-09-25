// Per-operation aggregation: groups Trials by the concrete problem
// ("6 × 7") instead of the category ("1dx1d"). Powers the CategoryStatsDetail
// heatmap, hardest-problems list, and recurring-confusions list.
import type { StatsTrial } from "./computeStats";

export type OperationStats = {
  key: string; // canonical grouping key, e.g. "x|6|7" (operand order normalized)
  label: string; // display form, e.g. "6 × 7" or "12²"
  operands: number[]; // sorted — {6,7} and {7,6} are the same memorized fact
  attempts: number;
  errors: number;
  avgCorrectTimeMs: number | null; // null if never answered correctly
};

function symbol(codename: string): string {
  if (codename.includes("x")) return "×";
  if (codename.includes("+")) return "+";
  if (codename.includes("^")) return "²";
  return "?";
}

// Operand order is irrelevant for the supported binary operations (+, ×),
// so {6,7} and {7,6} are the same memorized fact and share a key.
function operationKey(codename: string, operands: number[]): string {
  return [codename, ...[...operands].sort((a, b) => a - b)].join("|");
}

function operationLabel(codename: string, operands: number[]): string {
  const sorted = [...operands].sort((a, b) => a - b);
  const sym = symbol(codename);
  return sym === "²" ? `${sorted[0]}²` : `${sorted[0]} ${sym} ${sorted[1]}`;
}

export function computeOperationStats(
  trials: readonly StatsTrial[],
  codename: string,
): OperationStats[] {
  const byOp = new Map<string, StatsTrial[]>();
  for (const t of trials) {
    if (t.categoryCodename !== codename) continue;
    const key = operationKey(codename, t.operands);
    const list = byOp.get(key) ?? [];
    list.push(t);
    byOp.set(key, list);
  }

  return [...byOp.entries()]
    .map(([key, list]) => {
      const correct = list.filter((t) => t.correct);
      return {
        key,
        label: operationLabel(codename, list[0].operands),
        operands: [...list[0].operands].sort((a, b) => a - b),
        attempts: list.length,
        errors: list.length - correct.length,
        avgCorrectTimeMs:
          correct.length > 0
            ? correct.reduce((sum, t) => sum + t.timeTaken, 0) / correct.length
            : null,
      };
    })
    .sort((a, b) => b.errors - a.errors || b.attempts - a.attempts);
}

export type Confusion = {
  asked: string; // "6 × 7"
  given: number; // the wrong answer the player typed, e.g. 48
  count: number; // how often this same wrong answer occurred
  neighborLabel: string | null; // "6 × 8" when `given` is a table neighbor
};

// Ported from packages/analysis features.py::classify_multiplication_error —
// the paper's table-neighbor finding: the wrong product equals a product one
// operand-step away (48 for 6×7 is 6×8). Returns the neighbor's operands.
export function multiplicationNeighbor(
  op1: number,
  op2: number,
  answer: number,
): [number, number] | null {
  const correct = op1 * op2;
  const candidates: [number, number][] = [
    [op1 - 1, op2],
    [op1 + 1, op2],
    [op1, op2 - 1],
    [op1, op2 + 1],
  ];
  for (const [a, b] of candidates) {
    if (a * b !== correct && a * b === answer) return [a, b];
  }
  return null;
}

export function findConfusions(
  trials: readonly StatsTrial[],
  codename: string,
): Confusion[] {
  if (!codename.includes("x")) return [];

  const counts = new Map<string, Confusion>();
  for (const t of trials) {
    if (t.categoryCodename !== codename || t.correct || t.answer === null) {
      continue;
    }
    const [a, b] = [...t.operands].sort((x, y) => x - y);
    const neighbor = multiplicationNeighbor(a, b, t.answer);
    const key = `${operationKey(codename, t.operands)}|${t.answer}`;
    const existing = counts.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      counts.set(key, {
        asked: `${a} × ${b}`,
        given: t.answer,
        count: 1,
        neighborLabel: neighbor ? `${neighbor[0]} × ${neighbor[1]}` : null,
      });
    }
  }

  return [...counts.values()].sort((a, b) => b.count - a.count);
}
