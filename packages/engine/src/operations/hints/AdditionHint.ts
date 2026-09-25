import type { Hint } from "./Hint";

/**
 * Splits the right operand into tens + units so the player adds left to
 * right: 47 + 35 → 47 + 30 + 5 → 77 + 5. This is the decomposition the
 * addition tutorial teaches. Stops one step short — the player still does
 * the final units addition. Pointless when the right operand has no units
 * to peel off (47 + 30 is already the trick) or fits in one digit.
 */
export class AdditionHint implements Hint {
  constructor(
    private left: number,
    private right: number,
  ) {}

  hasHint(): boolean {
    return this.right >= 10 && this.right % 10 !== 0;
  }

  getSteps(): string[] {
    if (!this.hasHint()) return [];
    const tens = this.right - (this.right % 10);
    const units = this.right % 10;
    return [
      `${this.left} + ${this.right}`,
      `= ${this.left} + ${tens} + ${units}`,
      `= ${this.left + tens} + ${units}`,
    ];
  }
}
