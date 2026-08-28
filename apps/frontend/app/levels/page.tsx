import { Api } from "@/api/Api";
import { LevelsList } from "@/components/LevelsList";
import { parseSessionCookie, SESSION_COOKIE } from "@/storage/session";
import { cookies } from "next/headers";

export default async function LevelsPage() {
  const cookieStore = await cookies();
  const session = parseSessionCookie(cookieStore.get(SESSION_COOKIE)?.value);
  const stats = session
    ? await Api.fetchLevelStats(session.token).catch(() => ({}))
    : {};

  const levelKeys = await Api.fetchLevelNumbers();

  return <LevelsList stats={stats} levelKeys={levelKeys} />;
}
