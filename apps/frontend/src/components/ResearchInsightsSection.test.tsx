import { screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import { renderWithIntl } from "@/testUtils/renderWithIntl";
import type { SyncedTrial } from "../api/Api";
import { ResearchInsightsSection } from "./ResearchInsightsSection";

let seq = 0;
function trial(over: Partial<SyncedTrial> = {}): SyncedTrial {
  const operands = over.operands ?? [6, 7];
  seq += 1;
  return {
    id: `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`,
    runId: "22222222-2222-4222-8222-222222222222",
    levelNumber: null,
    runType: "practice",
    categoryCodename: "1dx1d",
    operands,
    answer: operands[0] * operands[1],
    correct: true,
    timeExceeded: false,
    timeTaken: 2000,
    playedAt: 1_700_000_000_000 + seq,
    hintShown: false,
    ...over,
  } as SyncedTrial;
}

const many = (n: number, over: Partial<SyncedTrial>) =>
  Array.from({ length: n }, () => trial(over));

test("a new player sees the counter, raw numbers and what each claim still needs", () => {
  renderWithIntl(
    <ResearchInsightsSection
      trials={[
        trial(),
        trial({ operands: [6, 6] }),
        trial({ operands: [6, 4] }),
      ]}
    />,
  );

  const section = screen.getByRole("region", {
    name: "Your contribution to science",
  });
  expect(within(section).getByText("3")).toBeTruthy();
  expect(
    within(section).getByText("operations contributed to this dataset"),
  ).toBeTruthy();
  expect(
    within(section).getByText(/the comparison needs 10 correct ties/),
  ).toBeTruthy();
  expect(
    within(section).getByText(/haven't missed a multiplication yet/),
  ).toBeTruthy();
  expect(
    within(section).getByText(/Each pair needs 3 correct answers/),
  ).toBeTruthy();
  expect(within(section).queryByText(/faster with identical/)).toBeNull();
});

test("a rich history states the tie direction, the neighbor share and the rhyme verdict", () => {
  renderWithIntl(
    <ResearchInsightsSection
      trials={[
        ...many(10, { operands: [6, 6], timeTaken: 2000 }),
        ...many(20, { operands: [5, 7], timeTaken: 2800 }),
        ...many(5, { operands: [6, 7], answer: 48, correct: false }),
        ...many(3, { operands: [6, 4], timeTaken: 1500 }),
        ...many(3, { operands: [4, 6], timeTaken: 2500 }),
        ...many(3, { operands: [9, 5], timeTaken: 1500 }),
        ...many(3, { operands: [5, 9], timeTaken: 2500 }),
      ]}
    />,
  );

  expect(screen.getByText("0.8s faster with identical factors")).toBeTruthy();
  expect(
    screen.getByText(
      /100% of your multiplication mistakes are table neighbors/,
    ),
  ).toBeTruthy();
  expect(screen.getByText("6 × 7: you answered 48, 5 times")).toBeTruthy();
  expect(screen.getByText(/faster for you on 2 of 2 pairs/)).toBeTruthy();
});
