import { Api, LevelStats } from "@/api/Api";
import { LevelPlay } from "@/components/LevelPlay";
import { SESSION_COOKIE, parseSessionCookie } from "@/storage/session";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";

type Props = { params: Promise<{ levelNumber: string }> };

export default async function LevelPage({ params }: Props) {
  const { levelNumber: raw } = await params;
  const levelNumber = Number(raw);
  if (!Number.isInteger(levelNumber)) notFound();

  const [mix, catalog] = await Promise.all([
    Api.fetchLevel(levelNumber),
    Api.fetchLevelNumbers(),
  ]);
  if (mix === null) notFound();

  const cookieStore = await cookies();
  const session = parseSessionCookie(cookieStore.get(SESSION_COOKIE)?.value);
  const stats: Record<string, LevelStats> = session
    ? await Api.fetchLevelStats(session.token).catch(() => ({}))
    : {};

  // Unlock gating happens client-side in LevelPlay against the local-first
  // store — the server snapshot is only a seed; a locally-completed run may
  // unlock a Level the server hasn't heard about yet.

  // The backend catalog — not a fixed level count — decides whether there is
  // a next Level and what its number is.
  const index = catalog.indexOf(levelNumber);
  const nextLevelNumber = index === -1 ? null : (catalog[index + 1] ?? null);

  return (
    <LevelPlay
      levelNumber={levelNumber}
      level={mix}
      stats={stats}
      nextLevelNumber={nextLevelNumber}
    />
  );
}
