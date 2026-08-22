import { useState, useEffect } from "react";
import { useAuth } from "../auth/store";

type Props = { onBack: () => void };

export function LoginScreen({ onBack }: Props) {
  const authState = useAuth((s) => s.state);
  const startLogin = useAuth((s) => s.startLogin);
  const requestCode = useAuth((s) => s.requestCode);
  const verifyCode = useAuth((s) => s.verifyCode);
  const cancel = useAuth((s) => s.cancel);

  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");

  useEffect(() => {
    if (authState.type === "idle") startLogin();
  }, [authState.type, startLogin]);

  function handleBack() {
    cancel();
    onBack();
  }

  if (authState.type === "enteringCode") {
    return (
      <div className="bg-[#1a1a24] border border-[#2e2e42] rounded-2xl p-8 w-full max-w-[420px] flex flex-col gap-4">
        <h1 className="text-xl font-bold tracking-tight">Enter your code</h1>
        <p className="text-sm text-[#a0a0c0]">We sent a 6-digit code to {authState.email}.</p>
        <input
          className="bg-[#0f0f13] border border-[#2e2e42] rounded-xl px-4 py-3 text-lg font-mono text-center tracking-[0.5em]"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          maxLength={6}
          placeholder="000000"
          autoFocus
        />
        {authState.error && <p className="text-sm text-[#f87171]">{authState.error}</p>}
        <button
          className="cursor-pointer bg-[#5a5af0] text-white w-full rounded-lg px-5 py-2.5 font-semibold hover:opacity-90 active:scale-[0.97] disabled:opacity-30 disabled:cursor-not-allowed transition-opacity"
          disabled={authState.submitting || code.length !== 6}
          onClick={() => verifyCode(code)}
        >
          {authState.submitting ? "Verifying…" : "Verify"}
        </button>
        <button
          className="cursor-pointer text-[#a0a0c0] text-sm hover:text-white transition-colors"
          onClick={handleBack}
        >
          Back to menu
        </button>
      </div>
    );
  }

  const emailState = authState.type === "enteringEmail" ? authState : null;

  return (
    <div className="bg-[#1a1a24] border border-[#2e2e42] rounded-2xl p-8 w-full max-w-[420px] flex flex-col gap-4">
      <h1 className="text-xl font-bold tracking-tight">Log in</h1>
      <p className="text-sm text-[#a0a0c0]">
        No password — we'll email you a one-time code. Playing without an account still works fine.
      </p>
      <input
        className="bg-[#0f0f13] border border-[#2e2e42] rounded-xl px-4 py-3"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        autoFocus
      />
      {emailState?.error && <p className="text-sm text-[#f87171]">{emailState.error}</p>}
      <button
        className="cursor-pointer bg-[#5a5af0] text-white w-full rounded-lg px-5 py-2.5 font-semibold hover:opacity-90 active:scale-[0.97] disabled:opacity-30 disabled:cursor-not-allowed transition-opacity"
        disabled={emailState?.submitting || email.length === 0}
        onClick={() => requestCode(email)}
      >
        {emailState?.submitting ? "Sending…" : "Send code"}
      </button>
      <button
        className="cursor-pointer text-[#a0a0c0] text-sm hover:text-white transition-colors"
        onClick={handleBack}
      >
        Back to menu
      </button>
    </div>
  );
}
