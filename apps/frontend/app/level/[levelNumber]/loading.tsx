import { useTranslations } from "next-intl";
import { panel } from "@/styles";

export default function Loading() {
  const t = useTranslations("Levels");
  return (
    <div className={`${panel} p-6 items-center justify-center min-h-60`}>
      <p className="text-sm text-muted">{t("loading")}</p>
    </div>
  );
}
