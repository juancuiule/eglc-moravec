import type { Hint } from "./Hint";

/**
 * Decomposes the left operand by digit position.
 * e.g. 23 × 4 → (20 + 3) × 4 → 80 + 12 → 92
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
    const products = parts.map((p) => p * right);
    const productsStr = products.join(" + ");
    // const result = left * right;

    return [
      `${left} × ${right}`,
      `= (${parts.join(" + ")}) × ${right}`,
      `= ${decomposed}`,
      // `= ${productsStr}`,
      // `= ${result}`,
    ];
  }
}

/** Splits a number into its positional components, largest first.
 *  e.g. 234 → [200, 30, 4] */
function digitParts(n: number): number[] {
  const parts: number[] = [];
  let place = 1;
  while (place <= n) {
    const digit = Math.floor(n / place) % 10;
    if (digit !== 0) parts.unshift(digit * place);
    place *= 10;
  }
  return parts.length > 0 ? parts : [n];
}
