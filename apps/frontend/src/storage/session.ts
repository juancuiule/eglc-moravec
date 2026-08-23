export const SESSION_COOKIE = "moravec_session";

// Matches the backend's own session TTL (apps/backend/src/config.ts).
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export type PersistedSession = {
  token: string;
  email: string;
};

/**
 * Parses a raw cookie value (as read from either `document.cookie` in the
 * browser or a request's Cookie header in proxy.ts) into a session. Pure
 * and environment-agnostic on purpose — this is the one piece of session
 * logic proxy.ts needs, and it has no `document`.
 */
export function parseSessionCookie(raw: string | undefined | null): PersistedSession | null {
  if (!raw) return null;
  try {
    return JSON.parse(decodeURIComponent(raw)) as PersistedSession;
  } catch {
    return null;
  }
}

/** Browser-only: reads the session cookie from the current document. */
export function loadSession(): PersistedSession | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${SESSION_COOKIE}=([^;]*)`));
  return parseSessionCookie(match?.[1] ?? null);
}

/** Browser-only: writes the session cookie. */
export function saveSession(session: PersistedSession): void {
  if (typeof document === "undefined") return;
  const value = encodeURIComponent(JSON.stringify(session));
  document.cookie = `${SESSION_COOKIE}=${value}; path=/; max-age=${MAX_AGE_SECONDS}; samesite=lax`;
}

/** Browser-only: deletes the session cookie. */
export function clearSession(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${SESSION_COOKIE}=; path=/; max-age=0; samesite=lax`;
}
