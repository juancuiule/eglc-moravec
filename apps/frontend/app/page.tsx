"use client";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useAuth } from "@/auth/store";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { panel, linkButton, navLink } from "@/styles";

export default function HomePage() {
  const t = useTranslations("Home");
  const authState = useAuth((s) => s.state);
  const logout = useAuth((s) => s.logout);

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
    </div>
  );
}
