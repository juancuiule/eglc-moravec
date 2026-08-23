import { notFound } from "next/navigation";
import { LEVELS } from "@/LEVELS";
import { Centered } from "@/components/Centered";
import { LevelPlay } from "@/components/LevelPlay";

type Props = { params: Promise<{ levelNumber: string }> };

export default async function LevelPage({ params }: Props) {
  const { levelNumber: raw } = await params;
  const levelNumber = Number(raw);

  // Whether this level *number* exists is static, public data (LEVELS) —
  // safe to check server-side. Whether *this player* has it unlocked is
  // not (that's local LevelStats) — see LevelPlay for that half.
  if (!Number.isInteger(levelNumber) || !(String(levelNumber) in LEVELS)) notFound();

  return (
    <Centered>
      <LevelPlay levelNumber={levelNumber} />
    </Centered>
  );
}
