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
  expect(onSubmitAnswer).toHaveBeenCalledWith(53, expect.any(Array));
});

test("backspace removes the last digit on click", () => {
  const { onSubmitAnswer } = renderPanel();

  fireEvent.click(screen.getByRole("button", { name: "5" }));
  fireEvent.click(screen.getByRole("button", { name: "3" }));
  fireEvent.click(screen.getByRole("button", { name: "Delete last digit" }));
  fireEvent.click(screen.getByRole("button", { name: "Submit" }));

  expect(onSubmitAnswer).toHaveBeenCalledWith(5, expect.any(Array));
});

test("the clear and backspace keys have a descriptive accessible name, not just their glyph", () => {
  renderPanel();

  expect(screen.getByRole("button", { name: "Clear" })).toBeDefined();
  expect(
    screen.getByRole("button", { name: "Delete last digit" }),
  ).toBeDefined();
});

test("records {key,t} per press — digits, erases, and the submit — passed to onSubmitAnswer", () => {
  const { onSubmitAnswer } = renderPanel();

  fireEvent.click(screen.getByRole("button", { name: "5" }));
  fireEvent.click(screen.getByRole("button", { name: "3" }));
  fireEvent.click(screen.getByRole("button", { name: "Delete last digit" }));
  fireEvent.click(screen.getByRole("button", { name: "2" }));
  fireEvent.click(screen.getByRole("button", { name: "Submit" }));

  const [, keystrokes] = onSubmitAnswer.mock.calls[0] as [
    number,
    { key: string; t: number }[],
  ];
  expect(keystrokes.map((k) => k.key)).toEqual(["5", "3", "⌫", "2", "⏎"]);
  expect(keystrokes.every((k) => k.t >= 0)).toBe(true);
});

test("physical keyboard input records the same trace — Backspace as ⌫, Enter as ⏎", () => {
  const { onSubmitAnswer } = renderPanel();

  fireEvent.keyDown(window, { key: "4" });
  fireEvent.keyDown(window, { key: "Backspace" });
  fireEvent.keyDown(window, { key: "7" });
  fireEvent.keyDown(window, { key: "Enter" });

  const [answer, keystrokes] = onSubmitAnswer.mock.calls[0] as [
    number,
    { key: string; t: number }[],
  ];
  expect(answer).toBe(7);
  expect(keystrokes.map((k) => k.key)).toEqual(["4", "⌫", "7", "⏎"]);
});
