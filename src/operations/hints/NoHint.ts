import type { Hint } from "./Hint";

export class NoHint implements Hint {
  hasHint(): boolean {
    return false;
  }
  getSteps(): string[] {
    return [];
  }
}
