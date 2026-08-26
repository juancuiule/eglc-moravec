"use client";

import { Api } from "@/api/Api";
import { useAuth } from "@/auth/store";
import { backLink, button, panel } from "@/styles";
import { syncLevelStatsFromRemote } from "@/sync/syncLevelStatsFromRemote";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * The "enter code" part of the interactive email -> code flow.
 * Whether to show this at all (i.e. whether the player is already
 * logged in) is decided server-side, before this ever mounts
 * — see app/login/otp/page.tsx.
 */
export function OtpForm({
  email,
  code: queryCode,
}: {
  email: string;
  code?: string;
}) {
  const router = useRouter();
  const authState = useAuth((s) => s.state);
  const login = useAuth((s) => s.login);

  const [code, setCode] = useState(queryCode ?? "");

  const verifyCode = useMutation({
    // Carries the current anonymous session's token (if any) so the
    // backend can fold its trials/level_stats into this email on success —
    // a no-op server-side if there isn't one.
    mutationFn: (vars: { code: string }) =>
      Api.verifyOtp(
        email,
        vars.code,
        authState.type === "anonymous" ? authState.token : undefined,
      ),
    onSuccess: (result) => {
      login({ token: result.token, email });
      void syncLevelStatsFromRemote(result.token);
      router.push("/");
    },
  });

  return (
    <div className={`${panel} p-8 gap-4`}>
      <div className="flex items-center gap-3">
        <Link href="/" className={backLink} aria-label="Back to menu">
          ←
        </Link>
        <h1 className="text-xl font-bold tracking-tight">Enter your code</h1>
      </div>
      <p className="text-sm text-muted">We sent a 6-digit code to {email}.</p>
      <label htmlFor="otp-code" className="sr-only">
        6-digit code
      </label>
      <input
        id="otp-code"
        className="bg-base border border-subtle rounded-xl px-4 py-3 text-lg font-mono text-center tracking-[0.5em]"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        placeholder="000000"
        autoFocus
      />
      {verifyCode.error && (
        <p className="text-sm text-danger">{verifyCode.error.message}</p>
      )}
      <button
        className={`${button({ intent: "primary" })} disabled:opacity-30 disabled:cursor-not-allowed`}
        disabled={verifyCode.isPending || code.length !== 6}
        onClick={() => verifyCode.mutate({ code })}
      >
        {verifyCode.isPending ? "Verifying…" : "Verify"}
      </button>
    </div>
  );
}
