"use client";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { Api } from "@/api/Api";
import { authToken, useAuth } from "@/auth/store";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { daysInMonth } from "@/stats/activityStats";
import { panel, linkButton, navLink } from "@/styles";

export default function HomePage() {
  const t = useTranslations("Home");
  const authState = useAuth((s) => s.state);
  const logout = useAuth((s) => s.logout);
  const token = useAuth((s) => authToken(s.state));

  // Cheap per-day aggregate — never pull the full trial list just to count.
  const { data: activity } = useQuery({
    queryKey: ["activity", token],
    queryFn: () =>
      token
        ? Api.fetchActivity(token, new Date().getTimezoneOffset())
        : Promise.resolve([]),
    staleTime: 60_000,
  });
  const daysThisMonth = activity ? daysInMonth(activity) : 0;

  return (
    <div className={`${panel} p-6 gap-6`}>
      <div className="flex items-center justify-between flex-wrap gap-y-2">
        <div className="flex items-center gap-2">
          <img src="/moravec.svg" alt="" className="h-8 w-auto" />
          <h1 className="text-2xl font-bold tracking-tight whitespace-nowrap">
            Moravec
          </h1>
        </div>
        <div className="flex items-center flex-wrap justify-end gap-1">
          <LocaleSwitcher />
          {authState.type === "logged-in" ? (
            <>
              <span className="text-xs text-accent-text font-mono break-all">
                {authState.email}
              </span>
              <button onClick={logout} className={navLink}>
                {t("logOut")}
              </button>
            </>
          ) : (
            <Link href="/login" className={navLink}>
              {t("logIn")}
            </Link>
          )}
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
