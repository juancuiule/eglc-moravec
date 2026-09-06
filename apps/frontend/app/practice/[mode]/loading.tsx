import { getTranslations } from "next-intl/server";
import { LoadingPanel } from "@/components/LoadingPanel";

export default async function Loading() {
  const t = await getTranslations("Practice");
  return <LoadingPanel label={t("loading")} />;
}
