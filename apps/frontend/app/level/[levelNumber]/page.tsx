import { notFound } from "next/navigation";
import { fetchLevelForPage } from "@/levels/fetchLevelForPage";
import { LevelPlay } from "@/components/LevelPlay";

type Props = { params: Promise<{ levelNumber: string }> };

export default async function LevelPage({ params }: Props) {
  const { levelNumber: raw } = await params;
  const levelNumber = Number(raw);
  if (!Number.isInteger(levelNumber)) notFound();

  // Whether this level *number* exists is public data from the backend's
  // Level catalog — safe to check server-side. Whether *this
  // player* has it unlocked is not (that's local LevelStats) — see
  // LevelPlay for that half. A "not-found" result is a real 404; an
  // "unreachable" one means the backend itself couldn't be reached, so
  // LevelPlay falls back to the locally-replicated copy instead of 404ing.
  const result = await fetchLevelForPage(levelNumber);
  if (result.status === "not-found") notFound();

  return <LevelPlay levelNumber={levelNumber} level={result.status === "found" ? result.mix : null} />;
}
