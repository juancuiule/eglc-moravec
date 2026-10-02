import { fireEvent, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import {
  Addition,
  categoryFromCodename,
  Multiplication,
  type AdditionCategory,
  type MultiplicationCategory,
  type Operation,
} from "engine";
import { AnsweringPanel } from "./AnsweringPanel";
import type { Answering } from "engine";
import { renderWithIntl as render } from "@/testUtils/renderWithIntl";

const category = categoryFromCodename("1d+1d") as AdditionCategory;
const operation = new Addition(2, 3, category);

function renderPanel({
  operation: op = operation,
  hintVisible = false,
}: { operation?: Operation; hintVisible?: boolean } = {}) {
  const onSubmitAnswer = vi.fn();
  const answeringState: Answering = {
    type: "answering",
    startedAt: Date.now(),
  };
  const { container } = render(
    <AnsweringPanel
      operation={op}
      playingState={answeringState}
      hintVisible={hintVisible}
      onSubmitAnswer={onSubmitAnswer}
      onTimeUp={vi.fn()}
      onAdvance={vi.fn()}
      headerLeft={null}
      headerRight={null}
    />,
  );
  return { onSubmitAnswer, container };
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

// Regression test for #79: requesting a hint on an operation whose hint()
// is NoHint — single-digit multiplication is a memorized fact, not a
// decomposition — used to render an empty accent-bordered card.
test("a requested hint renders no card when the operation has NoHint", () => {
  const noHint = new Multiplication(
    9,
    9,
    categoryFromCodename("1dx1d") as MultiplicationCategory,
  );
  const { container } = renderPanel({ operation: noHint, hintVisible: true });

  expect(container.querySelector(".bg-panel-accent")).toBeNull();
});

test("a requested hint still renders the steps when the operation has one", () => {
  const hintable = new Addition(
    47,
    35,
    categoryFromCodename("2d+2d") as AdditionCategory,
  );
  const { container } = renderPanel({ operation: hintable, hintVisible: true });

  const card = container.querySelector(".bg-panel-accent");
  expect(card).not.toBeNull();
  expect(card!.textContent).toContain("47 + 35");
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

test("no-op presses aren't evidence — backspace on empty and an eleventh digit never enter the trace", () => {
  const { onSubmitAnswer } = renderPanel();

  fireEvent.keyDown(window, { key: "Backspace" }); // empty answer — no-op
  fireEvent.keyDown(window, { key: "Delete" }); // C on empty — no-op
  for (const d of "1234567890") fireEvent.keyDown(window, { key: d });
  fireEvent.keyDown(window, { key: "5" }); // eleventh digit — rejected
  fireEvent.keyDown(window, { key: "Enter" });

  const [answer, keystrokes] = onSubmitAnswer.mock.calls[0] as [
    number,
    { key: string; t: number }[],
  ];
  expect(answer).toBe(1234567890);
  expect(keystrokes.map((k) => k.key)).toEqual([
    ..."1234567890".split(""),
    "⏎",
  ]);
});

test("a press burst past the schema bound truncates the trace but never loses the trial", () => {
  const { onSubmitAnswer } = renderPanel();

  // 280 effective presses (>256) — alternating accepted digit + erase.
  for (let i = 0; i < 140; i++) {
    fireEvent.keyDown(window, { key: "1" });
    fireEvent.keyDown(window, { key: "Backspace" });
  }
  fireEvent.keyDown(window, { key: "5" });
  fireEvent.keyDown(window, { key: "Enter" });

  const [answer, keystrokes] = onSubmitAnswer.mock.calls[0] as [
    number,
    { key: string; t: number }[],
  ];
  expect(answer).toBe(5);
  expect(keystrokes).toHaveLength(256);
});

test("a leading zero is rejected — no 0012-style answers, and it isn't evidence", () => {
  const { onSubmitAnswer } = renderPanel();

  fireEvent.click(screen.getByRole("button", { name: "0" })); // rejected
  fireEvent.keyDown(window, { key: "0" }); // rejected
  fireEvent.click(screen.getByRole("button", { name: "1" }));
  fireEvent.click(screen.getByRole("button", { name: "0" })); // accepted
  fireEvent.click(screen.getByRole("button", { name: "Submit" }));

  const [answer, keystrokes] = onSubmitAnswer.mock.calls[0] as [
    number,
    { key: string; t: number }[],
  ];
  expect(answer).toBe(10);
  expect(keystrokes.map((k) => k.key)).toEqual(["1", "0", "⏎"]);
});

test.each(["c", "C"])("the physical %s key clears the answer", (key) => {
  const { onSubmitAnswer } = renderPanel();

  fireEvent.keyDown(window, { key: "4" });
  fireEvent.keyDown(window, { key: "2" });
  fireEvent.keyDown(window, { key });
  fireEvent.keyDown(window, { key: "7" });
  fireEvent.keyDown(window, { key: "Enter" });

  const [answer, keystrokes] = onSubmitAnswer.mock.calls[0] as [
    number,
    { key: string; t: number }[],
  ];
  expect(answer).toBe(7);
  expect(keystrokes.map((k) => k.key)).toEqual(["4", "2", "C", "7", "⏎"]);
});

// A keypad button keeps focus after a tap/click, and the browser's default
// action for Enter on a focused <button> is to click it — so without
// preventDefault, Enter both submitted AND re-pressed the focused key,
// appending a digit to the already-submitted trace.
test.each(["Enter", "5", "Backspace", "Delete", "c"])(
  "a handled %s keydown suppresses the browser default",
  (key) => {
    renderPanel();
    fireEvent.keyDown(window, { key: "1" });
    expect(fireEvent.keyDown(window, { key })).toBe(false);
  },
);

test("unhandled keys keep their browser default", () => {
  renderPanel();
  expect(fireEvent.keyDown(window, { key: "Tab" })).toBe(true);
});

test("keyboard shortcuts with modifiers are left to the browser", () => {
  const { onSubmitAnswer } = renderPanel();
  fireEvent.keyDown(window, { key: "4" });
  // Cmd/Ctrl+C is copy, not clear.
  expect(fireEvent.keyDown(window, { key: "c", metaKey: true })).toBe(true);
  expect(fireEvent.keyDown(window, { key: "c", ctrlKey: true })).toBe(true);
  fireEvent.keyDown(window, { key: "Enter" });
  expect(onSubmitAnswer).toHaveBeenCalledWith(4, expect.any(Array));
});

test("the typed answer is a labelled live region", () => {
  renderPanel();
  fireEvent.keyDown(window, { key: "4" });
  fireEvent.keyDown(window, { key: "2" });
  const output = screen.getByRole("status", { name: "Your answer" });
  expect(output.getAttribute("aria-live")).toBe("polite");
  expect(output.textContent).toBe("42");
});
