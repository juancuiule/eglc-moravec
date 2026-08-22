import { API_URL } from "../apiUrl";

type ApiResult<T> = ({ ok: true } & T) | { ok: false; error: string };

async function errorFrom(res: Response): Promise<string> {
  const body = await res.json().catch(() => null);
  return (body && typeof body.error === "string" ? body.error : null) ?? "request_failed";
}

export async function requestOtp(email: string): Promise<ApiResult<object>> {
  const res = await fetch(`${API_URL}/auth/otp/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) return { ok: false, error: await errorFrom(res) };
  return { ok: true };
}

export async function verifyOtp(email: string, code: string): Promise<ApiResult<{ token: string }>> {
  const res = await fetch(`${API_URL}/auth/otp/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, code }),
  });
  if (!res.ok) return { ok: false, error: await errorFrom(res) };
  const data = await res.json();
  return { ok: true, token: data.token };
}

export async function checkSession(token: string): Promise<boolean> {
  const res = await fetch(`${API_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.ok;
}

export async function logoutRequest(token: string): Promise<void> {
  await fetch(`${API_URL}/auth/logout`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => {
    // best-effort; local logout proceeds regardless of network state
  });
}
