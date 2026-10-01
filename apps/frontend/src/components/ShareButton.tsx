"use client";

import { Check, Share2 } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { encodeSharePayload, type SharePayload } from "../share/payload";
import { backLink } from "../styles";

type Props = { payload: SharePayload; className?: string };

// Compact share affordance — the native share sheet when the platform has
// one (mobile), clipboard copy otherwise. The encoded result travels inside
// the URL; nothing is uploaded anywhere.
export function ShareButton({ payload, className }: Props) {
  const t = useTranslations("Share");
  const [copied, setCopied] = useState(false);

  const url = `${window.location.origin}/share/${encodeSharePayload(payload)}`;

  async function onShare() {
    if (navigator.share !== undefined) {
      try {
        await navigator.share({ url, title: "EGLC Moravec" });
        return;
      } catch {
        // Cancelled sheet or a platform that rejects share — fall through
        // to clipboard rather than treating it as an error.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // No clipboard either (insecure context) — nothing more to offer.
    }
  }

  // Icon-only: the label lives in aria-label, and the "copied" confirmation
  // goes to a separate live region (an aria-label change isn't announced).
  // A check icon swaps in briefly as the visual confirmation.
  return (
    <>
      <button
        type="button"
        onClick={onShare}
        aria-label={t("share")}
        title={t("share")}
        className={className ?? `${backLink} cursor-pointer`}
      >
        {copied ? (
          <Check size={18} aria-hidden="true" className="text-teal" />
        ) : (
          <Share2 size={18} aria-hidden="true" />
        )}
      </button>
      <span role="status" className="sr-only">
        {copied ? t("copied") : ""}
      </span>
    </>
  );
}
