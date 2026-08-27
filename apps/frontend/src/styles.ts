import { cva, type VariantProps } from "class-variance-authority";

// Shared Tailwind class strings for shapes repeated across multiple
// components — every color they reference comes from app/globals.css's
// @theme, never a raw hex. This file is about structure/repetition, not
// about naming individual colors.

/**
 * The elevated card every screen is built from. Callers add their own
 * padding and gap. The max-width is fixed here, not left to callers —
 * every screen sharing one width is what keeps the page from visibly
 * shifting sideways as you navigate between them (see the root layout for
 * the matching top-alignment half of that).
 */
export const panel = "bg-panel border border-subtle rounded-2xl w-full max-w-[480px] flex flex-col";

/** Same width as `panel`, for the rare surface (FinishedScreen's correct/wrong tinting) that doesn't build on `panel` itself. */
export const panelMaxWidth = "max-w-[480px]";

/** The four button treatments used across the app. Callers add their own layout classes (block, flex-1, text-center, …). */
export const button = cva("cursor-pointer rounded-lg", {
  variants: {
    intent: {
      primary: "text-white font-semibold px-5 py-2.5 bg-accent hover:opacity-90 active:scale-[0.97] transition-opacity",
      /** The "move forward" action (play next, submit) — the brand's teal, not a semantic green. */
      success: "text-white font-semibold px-5 py-2.5 bg-teal hover:opacity-90 active:scale-[0.97] transition-opacity",
      /** Same weight as primary, lower visual priority — pink outline instead of a solid fill. */
      outline:
        "text-accent-text font-semibold px-5 py-2.5 bg-panel border-2 border-accent hover:bg-panel-accent active:scale-[0.97] transition-colors",
      ghost: "text-muted font-medium w-full px-5 py-2 hover:text-foreground transition-colors",
    },
  },
});
export type ButtonIntent = VariantProps<typeof button>["intent"];

/**
 * `button`'s styling for a real `<Link>` standing in for a button (primary
 * navigation styled as a CTA, e.g. Home's "Play"). `<a>` is inline and
 * doesn't center its own text, unlike a native `<button>` — every such
 * caller needs the same `text-center block` on top of `button`'s classes,
 * so it's baked in here instead of repeated at each call site. Callers still
 * add their own extra layout classes (`flex-1`, …) same as with `button`.
 */
export function linkButton(options: Parameters<typeof button>[0]) {
  return `${button(options)} text-center block`;
}

/** The "←" back-arrow affordance — used as both a <Link> and a plain onClick button. */
export const backLink = "text-muted hover:text-foreground transition-colors text-lg leading-none";

export const textLink = "text-muted text-sm hover:text-foreground transition-colors";

/** The in-trial "Hint" button — same disabled/enabled treatment in Level play and Practice. */
export const hintButton = cva("text-xs font-medium px-2 py-1 rounded-lg transition-all", {
  variants: {
    disabled: {
      true: "text-disabled cursor-not-allowed",
      false: "text-accent-text hover:bg-subtle cursor-pointer",
    },
  },
});
