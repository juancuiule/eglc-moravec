import { getTranslations } from "next-intl/server";
import { panel } from "@/styles";

export default async function Loading() {
  const t = await getTranslations("Practice");

  return (
    <div className={`${panel} p-6 items-center justify-center min-h-[240px]`}>
      <p className="text-sm text-muted">{t("loading")}</p>
    </div>
  );
}
