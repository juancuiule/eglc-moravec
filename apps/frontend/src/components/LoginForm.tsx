"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { Api } from "@/api/Api";
import { useAuth } from "@/auth/store";
import { syncLevelStatsFromRemote } from "@/sync/syncLevelStatsFromRemote";
import { panel, primaryButton, textLink } from "@/styles";

type Step = { type: "email" } | { type: "code"; email: string };

/**
 * The interactive email -> code flow. Whether to show this at all (i.e.
 * whether the player is already logged in) is decided server-side, before
 * this ever mounts — see app/login/page.tsx.
 */
export function LoginForm() {
  const router = useRouter();
  const login = useAuth((s) => s.login);

  const [step, setStep] = useState<Step>({ type: "email" });
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");

  const requestCode = useMutation({
    mutationFn: (email: string) => Api.requestOtp(email),
    onSuccess: (_data, email) => setStep({ type: "code", email }),
  });

  const verifyCode = useMutation({
    mutationFn: (vars: { email: string; code: string }) => Api.verifyOtp(vars.email, vars.code),
    onSuccess: (result, vars) => {
      login({ token: result.token, email: vars.email });
      void syncLevelStatsFromRemote(result.token);
      router.push("/");
    },
  });

  if (step.type === "code") {
    return (
      <div className={`${panel} p-8 gap-4`}>
        <h1 className="text-xl font-bold tracking-tight">Enter your code</h1>
        <p className="text-sm text-muted">We sent a 6-digit code to {step.email}.</p>
        <input
          className="bg-base border border-subtle rounded-xl px-4 py-3 text-lg font-mono text-center tracking-[0.5em]"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          maxLength={6}
          placeholder="000000"
          autoFocus
        />
        {verifyCode.error && <p className="text-sm text-danger">{verifyCode.error.message}</p>}
        <button
          className={`${primaryButton} disabled:opacity-30 disabled:cursor-not-allowed`}
          disabled={verifyCode.isPending || code.length !== 6}
          onClick={() => verifyCode.mutate({ email: step.email, code })}
        >
          {verifyCode.isPending ? "Verifying…" : "Verify"}
        </button>
        <Link href="/" className={textLink}>
          Back to menu
        </Link>
      </div>
    );
  }

  return (
    <div className={`${panel} p-8 gap-4`}>
      <h1 className="text-xl font-bold tracking-tight">Log in</h1>
      <p className="text-sm text-muted">
        No password — we'll email you a one-time code. Playing without an account still works fine.
      </p>
      <input
        className="bg-base border border-subtle rounded-xl px-4 py-3"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        autoFocus
      />
      {requestCode.error && <p className="text-sm text-danger">{requestCode.error.message}</p>}
      <button
        className={`${primaryButton} disabled:opacity-30 disabled:cursor-not-allowed`}
        disabled={requestCode.isPending || email.length === 0}
        onClick={() => requestCode.mutate(email)}
      >
        {requestCode.isPending ? "Sending…" : "Send code"}
      </button>
      <Link href="/" className={textLink}>
        Back to menu
      </Link>
    </div>
  );
}
