export const LEVEL_COMPLETE_THRESHOLD = 15;

export function starsForScore(correctCount: number): 0 | 1 | 2 | 3 {
  if (correctCount >= 20) return 3;
  if (correctCount >= 17) return 2;
  if (correctCount >= 15) return 1;
  return 0;
}
