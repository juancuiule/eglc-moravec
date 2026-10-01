// The single seam for sound + haptic feedback: cuelume (synthesized audio
// cues) and web-haptics are imported here and nowhere else. Callers name
// moments — "key", "select", "success", "error" — not recipes, so the
// libraries and the cue mapping stay swappable behind this module.
import { play, setTheme } from "cuelume";
import { WebHaptics } from "web-haptics";

// One theme for every cue — global for future plays, not persisted.
setTheme("bubble");

const STORAGE_KEY = "moravec:sound";

// Cached on first read — every key press asks, so storage isn't hit per tap.
let enabled: boolean | null = null;
let haptics: WebHaptics | null = null;

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

function buzz(input: Parameters<WebHaptics["trigger"]>[0]) {
  if (typeof window === "undefined") return;
  haptics ??= new WebHaptics();
  // trigger()'s promise resolves when the pattern finishes — a rejection is
  // only a failed cue, never worth surfacing.
  void haptics.trigger(input).catch(() => {});
}

export const feedback = {
  key(key: string): void {
    if (!isFeedbackEnabled()) return;
    play(key === "⌫" || key === "C" ? "close" : "tap");
    buzz(10);
  },
  select(): void {
    if (!isFeedbackEnabled()) return;
    play("select");
    buzz(10);
  },
  success(): void {
    if (!isFeedbackEnabled()) return;
    play("success");
    buzz("success");
  },
  error(): void {
    if (!isFeedbackEnabled()) return;
    play("error");
    buzz("error");
  },
};
