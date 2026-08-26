import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { TrialHistoryDots } from "./TrialHistoryDots";

function dotColors(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("span")).map((span) =>
    span.className.includes("bg-success")
      ? "success"
      : span.className.includes("bg-accent")
        ? "accent"
        : "subtle",
  );
}

describe("TrialHistoryDots", () => {
  it("renders exactly `total` dots regardless of how many outcomes are played", () => {
    const { container } = render(<TrialHistoryDots outcomes={[true, false]} total={20} />);
    expect(container.querySelectorAll("span")).toHaveLength(20);
  });

  it("colors played trials green (correct) or pink (wrong), in order", () => {
    const { container } = render(<TrialHistoryDots outcomes={[true, false, true]} total={5} />);
    expect(dotColors(container)).toEqual(["success", "accent", "success", "subtle", "subtle"]);
  });

  it("colors every dot gray when nothing has been played yet", () => {
    const { container } = render(<TrialHistoryDots outcomes={[]} total={4} />);
    expect(dotColors(container)).toEqual(["subtle", "subtle", "subtle", "subtle"]);
  });

  it("colors every dot green or pink once every trial has been played", () => {
    const { container } = render(<TrialHistoryDots outcomes={[true, true, false]} total={3} />);
    expect(dotColors(container)).toEqual(["success", "success", "accent"]);
  });
});
