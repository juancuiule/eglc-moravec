"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { linkButton, panel } from "@/styles";

// The panel shown when a screen can't render offline because nothing was
// cached — distinct from a crash or a bare "error" state: the app is fine,
// this device simply never downloaded this content while online.
export function OfflineNotice({ message }: { message: string }) {
  const t = useTranslations("Offline");
  const tCommon = useTranslations("Common");
  return (
    <div className={`${panel} p-6 gap-4`}>
      <h1 className="text-xl font-bold tracking-tight">{t("title")}</h1>
      <p className="text-sm text-muted">{message}</p>
      <Link href="/" className={linkButton({ intent: "primary" })}>
        {tCommon("backToMenu")}
      </Link>
    </div>
  );
}
