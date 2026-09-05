import Link from "next/link";
import { useTranslations } from "next-intl";
import { TUTORIAL_TOPICS } from "../tutorials/content";
import { panel, backLink } from "../styles";

export function TutorialsList() {
  const t = useTranslations("Tutorials");
  const tCommon = useTranslations("Common");

  return (
    <div className={`${panel} p-6 gap-4`}>
      <div className="flex items-center gap-3">
        <Link href="/" className={backLink} aria-label={tCommon("backToMenu")}>
          ←
        </Link>
        <h1 className="text-xl font-bold tracking-tight">{t("listTitle")}</h1>
      </div>

      <div className="flex flex-col gap-2">
        {TUTORIAL_TOPICS.map((topic) => (
          <Link
            key={topic}
            href={`/tutorial/${topic}`}
            className="flex items-center justify-between gap-3 rounded-xl px-4 py-3 bg-base border border-subtle hover:border-accent transition-all"
          >
            <span className="flex flex-col">
              <span className="font-semibold">
                {t(`topics.${topic}.title`)}
              </span>
              <span className="text-xs text-muted">
                {t(`topics.${topic}.subtitle`)}
              </span>
            </span>
            <span aria-hidden="true" className="text-muted shrink-0">
              →
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
