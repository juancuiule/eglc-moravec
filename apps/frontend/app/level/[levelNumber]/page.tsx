import { Api, LevelStats } from "@/api/Api";
import { LevelPlay } from "@/components/LevelPlay";
import { isLevelUnlocked } from "@/levels/isLevelUnlocked";
import { SESSION_COOKIE, parseSessionCookie } from "@/storage/session";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

type Props = { params: Promise<{ levelNumber: string }> };

export default async function LevelPage({ params }: Props) {
  const { levelNumber: raw } = await params;
  const levelNumber = Number(raw);
  if (!Number.isInteger(levelNumber)) notFound();

  const mix = await Api.fetchLevel(levelNumber);
  if (mix === null) notFound();

  const cookieStore = await cookies();
  const session = parseSessionCookie(cookieStore.get(SESSION_COOKIE)?.value);
  const stats: Record<string, LevelStats> = session
    ? await Api.fetchLevelStats(session.token).catch(() => ({}))
    : {};

  if (!isLevelUnlocked(levelNumber, stats)) redirect("/");

  return <LevelPlay levelNumber={levelNumber} level={mix} stats={stats} />;
}
