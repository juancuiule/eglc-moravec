import { notFound } from "next/navigation";
import { isSupportedCategoryCodename } from "engine";
import { PracticePlay } from "@/components/PracticePlay";

type Props = { params: Promise<{ mode: string }> };

export default async function PracticeModePage({ params }: Props) {
  const { mode } = await params;
  if (!isSupportedCategoryCodename(mode)) notFound();

  return <PracticePlay categoryCodename={mode} />;
}
