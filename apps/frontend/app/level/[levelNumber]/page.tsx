import { notFound } from "next/navigation";
import { Api } from "@/api/Api";
import { Centered } from "@/components/Centered";
import { LevelPlay } from "@/components/LevelPlay";

type Props = { params: Promise<{ levelNumber: string }> };

export default async function LevelPage({ params }: Props) {
  const { levelNumber: raw } = await params;
  const levelNumber = Number(raw);
  if (!Number.isInteger(levelNumber)) notFound();

  // Whether this level *number* exists is public data from the backend's
  // Level catalog — safe to check server-side. Whether *this
  // player* has it unlocked is not (that's local LevelStats) — see
  // LevelPlay for that half.
  const mix = await Api.fetchLevel(levelNumber);
  if (mix === null) notFound();

  return (
    <Centered>
      <LevelPlay levelNumber={levelNumber} level={mix} />
    </Centered>
  );
}
