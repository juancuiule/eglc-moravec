import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ALL_CATEGORIES } from "../stats/computeStats";
import { CATEGORY_LABELS } from "../categoryLabels";
import { panel, backLink } from "../styles";

export async function PracticeModeSelection() {
  const t = await getTranslations("Practice");
  const tCommon = await getTranslations("Common");

  return (
    <div className={`${panel} p-6 gap-4`}>
      <div className="flex items-center gap-3">
        <Link href="/" className={backLink} aria-label={tCommon("backToMenu")}>
          ←
        </Link>
        <h1 className="text-xl font-bold tracking-tight">{t("heading")}</h1>
      </div>

      <p className="text-sm text-muted">{t("description")}</p>

      <div className="grid grid-cols-3 gap-2">
        {ALL_CATEGORIES.map((codename) => (
          <Link
            key={codename}
            href={`/practice/${encodeURIComponent(codename)}`}
            className="flex flex-col items-center justify-center rounded-xl py-3 px-2 bg-base border border-subtle hover:border-accent hover:text-accent transition-all cursor-pointer font-mono text-sm font-semibold"
          >
            {CATEGORY_LABELS[codename] ?? codename}
          </Link>
        ))}
      </div>
    </div>
  );
}
