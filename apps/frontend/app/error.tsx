"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { panel, button, linkButton } from "@/styles";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("Errors");
  const tCommon = useTranslations("Common");

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className={`${panel} p-6 gap-4`}>
      <h1 className="text-xl font-bold tracking-tight">{t("title")}</h1>
      <p className="text-sm text-muted">{t("routeDescription")}</p>
      <div className="flex flex-col gap-2">
        <button className={button({ intent: "primary" })} onClick={reset}>
          {t("tryAgain")}
        </button>
        <Link href="/" className={linkButton({ intent: "ghost" })}>
          {tCommon("backToMenu")}
        </Link>
      </div>
    </div>
  );
}
