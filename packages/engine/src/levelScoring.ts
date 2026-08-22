export const LEVEL_COMPLETE_THRESHOLD = 15;

export function starsForScore(correctInTime: number): 0 | 1 | 2 | 3 {
  if (correctInTime >= 20) return 3;
  if (correctInTime >= 17) return 2;
  if (correctInTime >= 15) return 1;
  return 0;
}
