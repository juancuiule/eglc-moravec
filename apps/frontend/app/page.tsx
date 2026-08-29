"use client";
import Link from "next/link";
import { useAuth } from "@/auth/store";
import { panel, linkButton, navLink } from "@/styles";

export default function HomePage() {
  const authState = useAuth((s) => s.state);
  const logout = useAuth((s) => s.logout);

  return (
    <div className={`${panel} p-6 gap-6`}>
      <div className="flex items-center justify-between flex-wrap gap-y-2">
        <h1 className="text-2xl font-bold tracking-tight whitespace-nowrap">
          Moravec
        </h1>
        <div className="flex items-center flex-wrap justify-end gap-1">
          {authState.type === "logged-in" ? (
            <>
              <span className="text-xs text-accent-text font-mono break-all">
                {authState.email}
              </span>
              <button onClick={logout} className={navLink}>
                Log out
              </button>
            </>
          ) : (
            <Link href="/login" className={navLink}>
              Log in
            </Link>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Link href="/levels" className={linkButton({ intent: "success" })}>
          Play
        </Link>
        <div className="flex gap-2">
          <Link
            href="/practice"
            className={`${linkButton({ intent: "primary" })} flex-1`}
          >
            Practice
          </Link>
          <Link
            href="/stats"
            className={`${linkButton({ intent: "primary" })} flex-1`}
          >
            Stats
          </Link>
        </div>
        <Link href="/tutorials" className={linkButton({ intent: "outline" })}>
          Tutorials
        </Link>
      </div>
    </div>
  );
}
