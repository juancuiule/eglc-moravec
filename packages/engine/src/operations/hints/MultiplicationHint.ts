import type { Hint } from "./Hint";

/**
 * Decomposes the left operand by digit position.
 * e.g. 23 × 4 → (20 + 3) × 4 → 20×4 + 3×4
 * Stops at the decomposition — the player still does the arithmetic.
 */
export class MultiplicationHint implements Hint {
  constructor(
    private left: number,
    private right: number,
  ) {}

  hasHint(): boolean {
    return true;
  }

  getSteps(): string[] {
    const { left, right } = this;
    const parts = digitParts(left); // e.g. [20, 3] for 23
    const decomposed = parts.map((p) => `${p}×${right}`).join(" + ");

    return [
      `${left} × ${right}`,
      `= (${parts.join(" + ")}) × ${right}`,
      `= ${decomposed}`,
    ];
  }
}

/** Splits a number into its positional components, largest first.
 *  e.g. 234 → [200, 30, 4] */
function digitParts(n: number): number[] {
  const digits = String(n).split("").map(Number);
  const parts = digits
    .map((digit, i) => digit * 10 ** (digits.length - 1 - i))
    .filter((part) => part !== 0);
  return parts.length > 0 ? parts : [n];
}
