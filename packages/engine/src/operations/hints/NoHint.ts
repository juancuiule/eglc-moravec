import type { Hint } from "./Hint.js";

export class NoHint implements Hint {
  hasHint(): boolean {
    return false;
  }
  getSteps(): string[] {
    return [];
  }
}
