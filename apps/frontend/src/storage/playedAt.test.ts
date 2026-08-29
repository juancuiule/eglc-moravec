import { describe, it, expect } from "vitest";
import { computePlayedAtTimestamps } from "./playedAt";

describe("computePlayedAtTimestamps", () => {
  it("returns an empty array for no durations", () => {
    expect(computePlayedAtTimestamps([], 10_000)).toEqual([]);
  });

  it("places a single trial's timestamp at the finish moment", () => {
    expect(computePlayedAtTimestamps([1000], 10_000)).toEqual([10_000]);
  });

  it("works backward through durations, back-to-back, ending at the finish moment", () => {
    expect(computePlayedAtTimestamps([1000, 2000, 3000], 10_000)).toEqual([
      5000, 7000, 10_000,
    ]);
  });
});
