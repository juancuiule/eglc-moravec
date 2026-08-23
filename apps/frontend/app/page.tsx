"use client";

import Link from "next/link";
import { useAuth } from "@/auth/store";
import { Centered } from "@/components/Centered";
import { panel, successButton, primaryButton, outlineButton } from "@/styles";

const navLinkClassName =
  "text-sm text-muted hover:text-foreground transition-colors px-2 py-1 rounded-lg hover:bg-subtle";

export default function HomePage() {
  const authState = useAuth((s) => s.state);
  const logout = useAuth((s) => s.logout);

  return (
    <Centered>
      <div className={`${panel} p-6 max-w-[420px] gap-6`}>
        <div className="flex items-center justify-between flex-wrap gap-y-2">
          <h1 className="text-2xl font-bold tracking-tight whitespace-nowrap">Moravec</h1>
          <div className="flex items-center gap-1">
            {authState.type === "loggedIn" ? (
              <>
                <span
                  className="text-xs text-accent font-mono max-w-20 truncate"
                  title={authState.email}
                >
                  {authState.email}
                </span>
                <button onClick={logout} className={navLinkClassName}>
                  Log out
                </button>
              </>
            ) : (
              <Link href="/login" className={navLinkClassName}>
                Log in
              </Link>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Link href="/levels" className={`${successButton} text-center block`}>
            Play
          </Link>
          <div className="flex gap-2">
            <Link href="/practice" className={`${primaryButton} text-center block flex-1`}>
              Practice
            </Link>
            <Link href="/stats" className={`${outlineButton} text-center block flex-1`}>
              Stats
            </Link>
          </div>
        </div>
      </div>
    </Centered>
  );
}
