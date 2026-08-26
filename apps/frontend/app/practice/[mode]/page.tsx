import { notFound } from "next/navigation";
import { ALL_CATEGORIES } from "@/stats/computeStats";
import { PracticePlay } from "@/components/PracticePlay";

type Props = { params: Promise<{ mode: string }> };

export default async function PracticeModePage({ params }: Props) {
  const { mode: rawMode } = await params;
  const mode = decodeURIComponent(rawMode);
  if (!ALL_CATEGORIES.includes(mode)) notFound();

  return <PracticePlay categoryCodename={mode} />;
}
