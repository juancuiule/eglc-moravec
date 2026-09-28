import { Api } from "@/api/Api";
import { fetchStatsSeed } from "@/api/statsSeed";
import { LevelPlay } from "@/components/LevelPlay";
import { notFound } from "next/navigation";

type Props = { params: Promise<{ levelNumber: string }> };

export default async function LevelPage({ params }: Props) {
  const { levelNumber: raw } = await params;
  const levelNumber = Number(raw);
  if (!Number.isInteger(levelNumber)) notFound();

  const [mix, catalog, stats] = await Promise.all([
    Api.fetchLevel(levelNumber),
    Api.fetchLevelNumbers(),
    fetchStatsSeed(),
  ]);
  if (mix === null) notFound();

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
