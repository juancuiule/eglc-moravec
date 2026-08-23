// Shared Tailwind class strings for shapes repeated across multiple
// components — every color they reference comes from app/globals.css's
// @theme, never a raw hex. This file is about structure/repetition, not
// about naming individual colors.

/** The elevated card every screen is built from. Callers add their own padding, max-width, and gap. */
export const panel = "bg-panel border border-subtle rounded-2xl w-full flex flex-col";

const buttonBase =
  "cursor-pointer text-white rounded-lg px-5 py-2.5 font-semibold hover:opacity-90 active:scale-[0.97] transition-opacity";

export const primaryButton = `${buttonBase} bg-accent`;
/** The "move forward" action (play next, submit) — the brand's teal, not a semantic green. */
export const successButton = `${buttonBase} bg-teal`;

/** Same weight as primaryButton, lower visual priority — pink outline instead of a solid fill. */
export const outlineButton =
  "cursor-pointer text-accent bg-panel border-2 border-accent rounded-lg px-5 py-2.5 font-semibold hover:bg-panel-accent active:scale-[0.97] transition-colors";

export const ghostButton =
  "cursor-pointer text-muted w-full rounded-lg px-5 py-2 font-medium hover:text-foreground transition-colors";

/** The "←" back-arrow affordance — used as both a <Link> and a plain onClick button. */
export const backLink = "text-muted hover:text-foreground transition-colors text-lg leading-none";

export const textLink = "text-muted text-sm hover:text-foreground transition-colors";

const hintButtonBase = "text-xs font-medium px-2 py-1 rounded-lg transition-all";

/** The in-trial "Hint" button — same disabled/enabled treatment in Level play and Practice. */
export function hintButtonClassName(disabled: boolean): string {
  return `${hintButtonBase} ${disabled ? "text-disabled cursor-not-allowed" : "text-accent hover:bg-subtle cursor-pointer"}`;
}
