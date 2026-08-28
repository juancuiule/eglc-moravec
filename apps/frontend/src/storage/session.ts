export const SESSION_COOKIE = "moravec_session";

const MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export type PersistedSession = {
  token: string;
  email: string | null;
};

export function parseSessionCookie(
  raw: string | undefined | null,
): PersistedSession | null {
  if (!raw) return null;
  try {
    return JSON.parse(decodeURIComponent(raw)) as PersistedSession;
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
