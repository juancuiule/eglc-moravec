import type { Hint } from "./Hint";

/**
 * Completes the left operand to the next ten and takes the difference from
 * the right: 47 + 35 → (47 + 3) + (35 − 3) → 50 + 32. Stops one step short,
 * like AdditionHint. Pointless when the left operand is already round or
 * fits in one digit.
 */
export class ComplementAdditionHint implements Hint {
  constructor(
    private left: number,
    private right: number,
  ) {}

  hasHint(): boolean {
    return this.left >= 10 && this.left % 10 !== 0;
  }

  getSteps(): string[] {
    if (!this.hasHint()) return [];
    const { left, right } = this;
    const make = 10 - (left % 10);
    return [
      `${left} + ${right}`,
      `= (${left} + ${make}) + (${right} − ${make})`,
      `= ${left + make} + ${right - make}`,
    ];
  }
}
