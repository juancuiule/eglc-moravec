import { notFound } from "next/navigation";
import { isSupportedCategoryCodename } from "engine";
import { FocusPracticePlay } from "@/components/FocusPracticePlay";
import { PracticePlay } from "@/components/PracticePlay";
import { FOCUS_MODE } from "@/practice/focus";

type Props = { params: Promise<{ mode: string }> };

export default async function PracticeModePage({ params }: Props) {
  const { mode: rawMode } = await params;
  let mode: string;
  try {
    mode = decodeURIComponent(rawMode);
  } catch {
    notFound();
  }
  // "focus" is a session mode, not a category codename — it gets its own
  // screen instead of going through the codename validator.
  if (mode === FOCUS_MODE) return <FocusPracticePlay />;
  if (!isSupportedCategoryCodename(mode)) notFound();

  return <PracticePlay config={{ mode: "category", categoryCodename: mode }} />;
}
