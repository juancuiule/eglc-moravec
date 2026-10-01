import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { feedback, setFeedbackEnabled } from "@/feedback";
import { SoundToggle } from "./SoundToggle";
import { renderWithIntl as render } from "@/testUtils/renderWithIntl";

// The real feedback module is jsdom-safe here — the toggle only reads and
// writes the enabled flag, never reaching cuelume/web-haptics. Its enabled
// cache persists across tests in this file, so sync it via
// setFeedbackEnabled rather than setting storage directly.
beforeEach(() => {
  setFeedbackEnabled(true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

test("renders pressed by default — sound is on unless explicitly off", async () => {
  render(<SoundToggle />);

  const button = await screen.findByRole("button", { name: "Sound" });
  expect(button.getAttribute("aria-pressed")).toBe("true");
});

test("clicking unmutes → muted flips aria-pressed and persists 'off'", async () => {
  render(<SoundToggle />);

  const button = await screen.findByRole("button", { name: "Sound" });
  fireEvent.click(button);

  expect(button.getAttribute("aria-pressed")).toBe("false");
  expect(localStorage.getItem("moravec:sound")).toBe("off");
});

test("a stored 'off' renders unpressed after mount", async () => {
  setFeedbackEnabled(false);
  render(<SoundToggle />);

  const button = await screen.findByRole("button", { name: "Sound" });
  await waitFor(() =>
    expect(button.getAttribute("aria-pressed")).toBe("false"),
  );
});

test("turning sound ON plays the toggle cue — turning it off is silent", async () => {
  const toggleSpy = vi.spyOn(feedback, "toggle").mockImplementation(() => {});
  setFeedbackEnabled(false);
  render(<SoundToggle />);

  const button = await screen.findByRole("button", { name: "Sound" });
  await waitFor(() =>
    expect(button.getAttribute("aria-pressed")).toBe("false"),
  );

  fireEvent.click(button); // off → on: cue
  expect(toggleSpy).toHaveBeenCalledTimes(1);
  expect(button.getAttribute("aria-pressed")).toBe("true");

  fireEvent.click(button); // on → off: silent
  expect(toggleSpy).toHaveBeenCalledTimes(1);
});
