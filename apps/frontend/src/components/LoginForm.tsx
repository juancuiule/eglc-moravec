"use client";

import { Api } from "@/api/Api";
import { backLink, button, panel } from "@/styles";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");

  const requestCode = useMutation({
    mutationFn: (email: string) => Api.requestOtp(email),
    onSuccess: (_data, email) =>
      router.push(`/login/otp?email=${encodeURIComponent(email)}`),
  });

  const isDisabled = requestCode.isPending || email.length === 0;

  return (
    <div className={`${panel} p-8 gap-4`}>
      <div className="flex items-center gap-3">
        <Link href="/" className={backLink} aria-label="Back to menu">
          ←
        </Link>
        <h1 className="text-xl font-bold tracking-tight">Login</h1>
      </div>

      <p className="text-sm text-muted">
        No password — we'll email you a one-time code. Playing without an
        account still works fine.
      </p>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!isDisabled) {
            requestCode.mutate(email);
          }
        }}
      >
        <label htmlFor="login-email" className="sr-only">
          Email
        </label>
        <input
          id="login-email"
          className="bg-base border border-subtle rounded-xl px-4 py-3"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          autoFocus
        />
        {requestCode.error && (
          <p className="text-sm text-danger">{requestCode.error.message}</p>
        )}
        <button
          type="submit"
          className={`${button({ intent: "primary" })} disabled:opacity-30 disabled:cursor-not-allowed`}
          disabled={requestCode.isPending || email.length === 0}
        >
          {requestCode.isPending ? "Sending…" : "Send code"}
        </button>
      </form>
    </div>
  );
}
