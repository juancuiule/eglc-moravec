import { Api, LevelStats } from "@/api/Api";
import { LevelsList } from "@/components/LevelsList";
import { SESSION_COOKIE, parseSessionCookie } from "@/storage/session";
import { cookies } from "next/headers";

export default async function LevelsPage() {
  const cookieStore = await cookies();
  const session = parseSessionCookie(cookieStore.get(SESSION_COOKIE)?.value);

  // Records and unlock state are derived from the local-first store — the
  // page only needs the catalog plus an optional server stats seed for
  // first paint (and so the menu isn't stuck locked when the boot trial
  // pull fails). The seed is session-scoped: a logout drops it.
  const [levelKeys, stats] = await Promise.all([
    Api.fetchLevelNumbers(),
    session
      ? Api.fetchLevelStats(session.token).catch(
          () => ({}) as Record<string, LevelStats>,
        )
      : Promise.resolve({} as Record<string, LevelStats>),
  ]);

  return <LevelsList levelKeys={levelKeys} stats={stats} />;
}
