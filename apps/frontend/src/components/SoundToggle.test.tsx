import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, test } from "vitest";
import { SoundToggle } from "./SoundToggle";
import { renderWithIntl as render } from "@/testUtils/renderWithIntl";

// The real feedback module is jsdom-safe here — the toggle only reads and
// writes the enabled flag, never reaching cuelume/web-haptics.
beforeEach(() => {
  localStorage.clear();
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
  localStorage.setItem("moravec:sound", "off");
  render(<SoundToggle />);

  const button = await screen.findByRole("button", { name: "Sound" });
  await waitFor(() =>
    expect(button.getAttribute("aria-pressed")).toBe("false"),
  );
});
