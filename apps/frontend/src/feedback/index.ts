// The single seam for sound feedback: cuelume (synthesized audio cues) is
// imported here and nowhere else. Callers name moments — "key", "select",
// "success", "error" — not recipes, so the library and the cue mapping stay
// swappable behind this module.
import { play, setTheme } from "cuelume";

// One theme for every cue — global for future plays, not persisted.
setTheme("bubble");

const STORAGE_KEY = "moravec:sound";

// Cached on first read — every key press asks, so storage isn't hit per tap.
let enabled: boolean | null = null;

export function isFeedbackEnabled(): boolean {
  if (enabled !== null) return enabled;
  try {
    // Anything but an explicit "off" (including missing) means enabled.
    enabled = localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    enabled = true;
  }
  return enabled;
}

export function setFeedbackEnabled(value: boolean): void {
  enabled = value;
  try {
    localStorage.setItem(STORAGE_KEY, value ? "on" : "off");
  } catch {
    // Private-mode storage failures shouldn't silence the toggle's state.
  }
}

export const feedback = {
  key(key: string): void {
    if (!isFeedbackEnabled()) return;
    play(key === "⌫" || key === "C" ? "close" : "tap");
  },
  select(): void {
    if (!isFeedbackEnabled()) return;
    play("select");
  },
  success(): void {
    if (!isFeedbackEnabled()) return;
    play("success");
  },
  error(): void {
    if (!isFeedbackEnabled()) return;
    play("error");
  },
};
