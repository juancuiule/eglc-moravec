import { notFound } from "next/navigation";
import { LevelPageClient } from "@/components/LevelPageClient";

type Props = { params: Promise<{ levelNumber: string }> };

export default async function LevelPage({ params }: Props) {
  const { levelNumber: raw } = await params;
  const levelNumber = Number(raw);
  if (!Number.isInteger(levelNumber)) notFound();

  // The Level's mix itself is fetched client-side, not here: whether this
  // level number exists is public backend data, but the offline cache
  // fallback (see storage/levelCache.ts) needs IndexedDB, which a Server
  // Component can't reach. Whether *this player* has it unlocked is also
  // client-side (local LevelStats) — see LevelPlay for that half.
  return <LevelPageClient levelNumber={levelNumber} />;
}
