// The single seam for sound + haptic feedback: cuelume (synthesized audio
// cues) and web-haptics are imported here and nowhere else. Callers name
// moments — "key", "success", "error" — not recipes, so the libraries and
// the cue mapping stay swappable behind this module.
import { play } from "cuelume";
import { WebHaptics } from "web-haptics";

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
    play(key === "⌫" || key === "C" ? "press" : "tick");
    buzz(10);
  },
  // Buttons and links — fired by the delegated listener in bindFeedback.
  tap(): void {
    if (!isFeedbackEnabled()) return;
    play("pulse");
    buzz(10);
  },
  toggle(): void {
    if (!isFeedbackEnabled()) return;
    play("toggle");
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

/**
 * One delegated click listener gives every real button and link a tap cue.
 * Click (not pointerdown) so keyboard activation is covered and a touch
 * that starts a scroll doesn't sound. Controls with their own cue — the
 * keypad, Submit, the Sound toggle itself — opt out via
 * `data-feedback="off"` on themselves or an ancestor. Returns the unbind.
 */
export function bindFeedback(root: Document = document): () => void {
  function onClick(e: MouseEvent) {
    const el = (e.target as Element | null)?.closest?.("button, a[href]");
    if (!el) return;
    if (el.closest('[data-feedback="off"]')) return;
    if (el.matches(':disabled, [aria-disabled="true"]')) return;
    feedback.tap();
  }
  root.addEventListener("click", onClick);
  return () => root.removeEventListener("click", onClick);
}
