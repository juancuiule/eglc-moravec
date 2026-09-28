import { cookies } from "next/headers";
import { SESSION_COOKIE, parseSessionCookie } from "../storage/session";
import { Api, type LevelStats } from "./Api";

// Server Components only — reads the session cookie and pulls the user's
// level-stats snapshot for first paint. No session (or a failed pull)
// resolves to {} — the local-first store is the real read model.
export async function fetchStatsSeed(): Promise<Record<string, LevelStats>> {
  const cookieStore = await cookies();
  const session = parseSessionCookie(cookieStore.get(SESSION_COOKIE)?.value);
  if (!session) return {};
  return Api.fetchLevelStats(session.token).catch(() => ({}));
}
