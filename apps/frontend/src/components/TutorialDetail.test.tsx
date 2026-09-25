import { screen, fireEvent } from "@testing-library/react";
import { expect, test } from "vitest";
import { TutorialDetail } from "./TutorialDetail";
import { renderWithIntl as render } from "@/testUtils/renderWithIntl";

test("multiplication has a category selector and a live hint", () => {
  render(<TutorialDetail topic="multiplication" />);

  expect(
    screen
      .getByRole("button", { name: "4d × 1d" })
      .getAttribute("aria-pressed"),
  ).toBe("true");
  expect(screen.getByTestId("hint-card")).toBeDefined();
  expect(screen.getByTestId("tutorial-expression").textContent).toMatch(
    /= \?$/,
  );

  fireEvent.click(screen.getByRole("button", { name: "1d × 1d" }));
  expect(
    screen
      .getByRole("button", { name: "1d × 1d" })
      .getAttribute("aria-pressed"),
  ).toBe("true");
  expect(
    screen
      .getByRole("button", { name: "4d × 1d" })
      .getAttribute("aria-pressed"),
  ).toBe("false");
});

test("show answer reveals the numeric result", () => {
  render(<TutorialDetail topic="squaring2d" />);

  expect(screen.getByTestId("tutorial-expression").textContent).toMatch(
    /= \?$/,
  );

  fireEvent.click(screen.getByRole("button", { name: "Show answer" }));
  expect(screen.getByTestId("tutorial-expression").textContent).toMatch(
    /= \d+$/,
  );

  fireEvent.click(screen.getByRole("button", { name: "Hide answer" }));
  expect(screen.getByTestId("tutorial-expression").textContent).toMatch(
    /= \?$/,
  );
});

test("addition's live hint shows the tens-then-units decomposition", () => {
  render(<TutorialDetail topic="addition" />);
  // ~1 in 9 random 2d+2d examples has a multiple-of-ten right operand, where
  // there's legitimately no hint — reroll until a decomposable one comes up.
  for (let i = 0; i < 25 && screen.queryByTestId("hint-card") === null; i++) {
    fireEvent.click(screen.getByRole("button", { name: "New example" }));
  }
  const hintCard = screen.getByTestId("hint-card");
  expect(hintCard.textContent).toMatch(/\+ \d+ \+ \d/);
});

test("the Practice CTA is a real link to that category's practice page", () => {
  render(<TutorialDetail topic="multiplication" />);

  fireEvent.click(screen.getByRole("button", { name: "1d × 1d" }));
  const practiceLink = screen.getByRole("link", { name: /Practice 1d × 1d/ });

  expect(practiceLink.getAttribute("href")).toBe("/practice/1dx1d");
});

test("split squaring topics have their own video and no category selector", () => {
  render(<TutorialDetail topic="squaring3d" />);

  expect(
    screen.getByTitle("Squaring (3 digits) tutorial").getAttribute("src"),
  ).toContain("VHsTlMzN76g");
  expect(screen.queryByRole("button", { name: "2d²" })).toBeNull();
  expect(screen.getByText(/simpler one-step version/)).toBeDefined();
});

test("Major System has a video, the digit table, and a worked example, but no interactive example or Practice CTA", () => {
  render(<TutorialDetail topic="majorSystem" />);

  expect(
    screen.getByTitle("Major System tutorial").getAttribute("src"),
  ).toContain("Fv0Si7UJHKw");
  expect(screen.getByText("P, B, V")).toBeDefined();
  expect(screen.getByText(/"lupa"/)).toBeDefined();
  expect(screen.queryByTestId("hint-card")).toBeNull();
  expect(screen.queryByTestId("tutorial-expression")).toBeNull();
  expect(screen.queryByRole("link", { name: /Practice/ })).toBeNull();
});
