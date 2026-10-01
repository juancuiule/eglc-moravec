"use client";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useAuth } from "@/auth/store";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { useLocalTrials } from "@/local/hooks";
import { daysTrainedThisMonth } from "@/stats/activityStats";
import { panel, linkButton, navLink } from "@/styles";

export default function HomePage() {
  const t = useTranslations("Home");
  const authState = useAuth((s) => s.state);
  const logout = useAuth((s) => s.logout);

  // Read from the local-first store — correct offline and including runs
  // whose push hasn't landed yet.
  const localTrials = useLocalTrials();
  const daysThisMonth = localTrials ? daysTrainedThisMonth(localTrials) : 0;

  return (
    <div className={`${panel} p-6 gap-6`}>
      {/* Logo on its own row; account (left) + language (right) on a single,
          non-wrapping row below. Locale-dependent labels ("Log in"/"Iniciar sesión") and
          long emails used to change how the shared row wrapped, shifting the
          whole panel on a language switch — now they only change widths
          within a row of fixed height (the email truncates). */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <img src="/moravec.svg" alt="" className="h-8 w-auto" />
          <h1 className="text-2xl font-bold tracking-tight whitespace-nowrap">
            Moravec
          </h1>
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 min-w-0">
            {authState.type === "logged-in" ? (
              <>
                <span
                  className="text-xs text-accent-text font-mono truncate min-w-0"
                  title={authState.email}
                >
                  {authState.email}
                </span>
                <button
                  onClick={logout}
                  className={`${navLink} shrink-0 whitespace-nowrap`}
                >
                  {t("logOut")}
                </button>
              </>
            ) : (
              <Link
                href="/login"
                className={`${navLink} shrink-0 whitespace-nowrap`}
              >
                {t("logIn")}
              </Link>
            )}
          </div>
          <LocaleSwitcher />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Link href="/levels" className={linkButton({ intent: "success" })}>
          {t("play")}
        </Link>
        <div className="flex gap-2">
          <Link
            href="/practice"
            className={`${linkButton({ intent: "primary" })} flex-1`}
          >
            {t("practice")}
          </Link>
          <Link
            href="/stats"
            className={`${linkButton({ intent: "primary" })} flex-1`}
          >
            {t("stats")}
          </Link>
        </div>
        <Link href="/tutorials" className={linkButton({ intent: "outline" })}>
          {t("tutorials")}
        </Link>
      </div>

      {daysThisMonth > 0 && (
        <p className="text-center text-xs text-muted-2">
          {t("daysTrainedThisMonth", { count: daysThisMonth })}
        </p>
      )}
    </div>
  );
}
