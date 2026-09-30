import { fetchLevelForPage } from "@/levels/fetchLevelForPage";
import { LevelPlay } from "@/components/LevelPlay";
import { LocalLevelPlay } from "@/components/LocalLevelPlay";
import { notFound } from "next/navigation";

type Props = { params: Promise<{ levelNumber: string }> };

export default async function LevelPage({ params }: Props) {
  const { levelNumber: raw } = await params;
  const levelNumber = Number(raw);
  if (!Number.isInteger(levelNumber)) notFound();

  const data = await fetchLevelForPage(levelNumber);
  if (data.status === "not-found") notFound();
  // Backend unreachable — render the same play experience from the local
  // catalog snapshot; the unlock gate applies locally inside LevelPlay.
  if (data.status === "unreachable")
    return <LocalLevelPlay levelNumber={levelNumber} />;

  // Unlock gating happens client-side in LevelPlay against the local-first
  // store — the server snapshot is only a seed; a locally-completed run may
  // unlock a Level the server hasn't heard about yet.
  return (
    <LevelPlay
      levelNumber={levelNumber}
      level={data.mix}
      stats={data.stats}
      nextLevelNumber={data.nextLevelNumber}
    />
  );
}
