import type { Hint } from "./Hint";

/**
 * Applies x² = (x−a)(x+a) + a², where `a` rounds x to the nearest multiple of 10.
 * Stops at the decomposition — the player still does the arithmetic.
 */
export class SquaringHint implements Hint {
  constructor(private x: number) {}

  hasHint(): boolean {
    return true;
  }

  getSteps(): string[] {
    return buildSteps(this.x);
  }
}

/** Choose a such that (x − a) is the nearest multiple of 10. */
function nearestA(x: number): number {
  const remainder = x % 10;
  return remainder > 5 ? remainder - 10 : remainder; // round up → negative a
}

function buildSteps(x: number): string[] {
  if (x < 10) {
    return [`${x}² = ${x * x}`];
  }

  const a = nearestA(x);
  const lo = x - a; // multiple of 10
  const hi = x + a;

  const aAbs = Math.abs(a);
  const signStr = a >= 0 ? "−" : "+";
  const signStrInv = a >= 0 ? "+" : "−";

  return [
    `${x}² = (${x}${signStr}${aAbs})(${x}${signStrInv}${aAbs}) + ${aAbs}²`,
    `= ${lo} × ${hi} + ${aAbs * aAbs}`,
  ];
}
