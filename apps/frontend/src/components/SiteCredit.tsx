import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

// Vertical-only hit-area expansion (same trick as `hintButton`) so the tiny
// links reach the 44px touch floor without overlapping each other.
const creditLink =
  "relative underline underline-offset-2 hover:text-accent-text transition-colors touch-manipulation after:absolute after:inset-x-0 after:top-1/2 after:h-11 after:-translate-y-1/2 after:content-['']";

function external(href: string) {
  return function ExternalLink(chunks: ReactNode) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={creditLink}
      >
        {chunks}
      </a>
    );
  };
}

/**
 * Small attribution below the panel. `mt-auto` (in the body's flex column)
 * pushes it to the bottom of the screen on short pages and lets it follow
 * the panel on tall ones; its bottom padding is 12px (or the safe-area inset).
 */
export function SiteCredit() {
  const t = useTranslations("Common");
  return (
    <footer
      className={[
        "mt-auto pt-6 text-center text-2xs text-muted-2",
        "pb-[max(0.75rem,env(safe-area-inset-bottom))]",
        "pl-[max(0.75rem,env(safe-area-inset-left))]",
        "pr-[max(0.75rem,env(safe-area-inset-right))]",
      ].join(" ")}
    >
      {t.rich("credit", {
        author: external("https://github.com/juancuiule"),
        org: external("https://elgatoylacaja.com/"),
      })}
    </footer>
  );
}
