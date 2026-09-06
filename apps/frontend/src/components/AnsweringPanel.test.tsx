import { fireEvent, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { Addition, categoryFromCodename, type AdditionCategory } from "engine";
import { AnsweringPanel } from "./AnsweringPanel";
import type { Answering } from "engine";
import { renderWithIntl as render } from "@/testUtils/renderWithIntl";

const category = categoryFromCodename("1d+1d") as AdditionCategory;
const operation = new Addition(2, 3, category);

function renderPanel() {
  const onSubmitAnswer = vi.fn();
  const answeringState: Answering = {
    type: "answering",
    startedAt: Date.now(),
  };
  render(
    <AnsweringPanel
      operation={operation}
      playingState={answeringState}
      trialId={0}
      hintVisible={false}
      onSubmitAnswer={onSubmitAnswer}
      onTimeUp={vi.fn()}
      onAdvance={vi.fn()}
      headerLeft={null}
      headerRight={null}
    />,
  );
  return { onSubmitAnswer };
}

// Regression test for the onPointerDown-only bug: the calculator's digit
// and Submit buttons must respond to a real click (which is what native
// keyboard Enter/Space activation of a focused <button> dispatches) — a
// pointerdown-only handler silently drops that entirely.
test("keypad and Submit respond to a plain click, not only a pointerdown", () => {
  const { onSubmitAnswer } = renderPanel();

  fireEvent.click(screen.getByRole("button", { name: "5" }));
  fireEvent.click(screen.getByRole("button", { name: "3" }));
  fireEvent.click(screen.getByRole("button", { name: "Submit" }));

  expect(onSubmitAnswer).toHaveBeenCalledTimes(1);
  expect(onSubmitAnswer).toHaveBeenCalledWith(53);
});

test("backspace removes the last digit on click", () => {
  const { onSubmitAnswer } = renderPanel();

  fireEvent.click(screen.getByRole("button", { name: "5" }));
  fireEvent.click(screen.getByRole("button", { name: "3" }));
  fireEvent.click(screen.getByRole("button", { name: "Delete last digit" }));
  fireEvent.click(screen.getByRole("button", { name: "Submit" }));

  expect(onSubmitAnswer).toHaveBeenCalledWith(5);
});

test("the clear and backspace keys have a descriptive accessible name, not just their glyph", () => {
  renderPanel();

  expect(screen.getByRole("button", { name: "Clear" })).toBeDefined();
  expect(
    screen.getByRole("button", { name: "Delete last digit" }),
  ).toBeDefined();
});
