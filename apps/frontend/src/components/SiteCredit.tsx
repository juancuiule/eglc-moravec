import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

// Vertical-only hit-area expansion (same trick as `hintButton`) so the tiny
// links reach the 44px touch floor without overlapping each other.
const creditLink =
  "relative underline underline-offset-2 hover:text-foreground transition-colors touch-manipulation after:absolute after:inset-x-0 after:top-1/2 after:h-11 after:-translate-y-1/2 after:content-['']";

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

/** Small attribution pinned to the bottom of the viewport, outside the panel. */
export function SiteCredit() {
  const t = useTranslations("Common");
  return (
    <footer className="fixed inset-x-0 bottom-[max(0.5rem,env(safe-area-inset-bottom))] text-center text-2xs text-muted-2">
      {t.rich("credit", {
        author: external("https://github.com/juancuiule"),
        org: external("https://elgatoylacaja.com/"),
      })}
    </footer>
  );
}
