import { SESSION_TTL_MS } from "engine";

export const SESSION_COOKIE = "moravec_session";

const MAX_AGE_SECONDS = SESSION_TTL_MS / 1000;

export type PersistedSession = {
  token: string;
  email: string | null;
};

export function parseSessionCookie(
  raw: string | undefined | null,
): PersistedSession | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(raw));
    // The cookie is user-editable — valid JSON of the wrong shape (a bare
    // number, an object without a token) must not reach auth state.
    if (typeof parsed !== "object" || parsed === null) return null;
    const candidate = parsed as Record<string, unknown>;
    if (typeof candidate.token !== "string") return null;
    if (candidate.email !== null && typeof candidate.email !== "string") {
      return null;
    }
    return { token: candidate.token, email: candidate.email };
  } catch {
    return null;
  }
}

export function loadSession(): PersistedSession | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${SESSION_COOKIE}=([^;]*)`),
  );
  return parseSessionCookie(match?.[1] ?? null);
}

export function saveSession(session: PersistedSession): void {
  if (typeof document === "undefined") return;
  const value = encodeURIComponent(JSON.stringify(session));
  document.cookie = `${SESSION_COOKIE}=${value}; path=/; max-age=${MAX_AGE_SECONDS}; samesite=lax`;
}

export function clearSession(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${SESSION_COOKIE}=; path=/; max-age=0; samesite=lax`;
}
