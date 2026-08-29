// Neither Level nor Practice trials carry an absolute timestamp of their
// own — only a `timeTaken` duration. Reconstruct one per trial by working
// backward from the batch's finish moment (the only absolute instant we
// have), subtracting each trial's duration in turn.
export function computePlayedAtTimestamps(
  timeTakens: number[],
  finishedAt: number,
): number[] {
  return [...timeTakens]
    .reverse()
    .reduce<{ cursor: number; timestamps: number[] }>(
      (acc, timeTaken) => ({
        cursor: acc.cursor - timeTaken,
        timestamps: [acc.cursor, ...acc.timestamps],
      }),
      { cursor: finishedAt, timestamps: [] },
    ).timestamps;
}
