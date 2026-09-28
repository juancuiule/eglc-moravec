import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { linkButton, panel } from "@/styles";

export default async function NotFound() {
  const t = await getTranslations("Errors");
  const tCommon = await getTranslations("Common");
  return (
    <div className={`${panel} p-6 gap-4`}>
      <h1 className="text-xl font-bold tracking-tight">{t("notFoundTitle")}</h1>
      <p className="text-sm text-muted">{t("notFoundDescription")}</p>
      <Link href="/" className={linkButton({ intent: "primary" })}>
        {tCommon("backToMenu")}
      </Link>
    </div>
  );
}
