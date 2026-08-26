import { notFound } from "next/navigation";
import { isTutorialTopic } from "@/tutorials/content";
import { TutorialDetail } from "@/components/TutorialDetail";

type Props = { params: Promise<{ type: string }> };

export default async function TutorialPage({ params }: Props) {
  const { type } = await params;
  if (!isTutorialTopic(type)) notFound();

  return <TutorialDetail topic={type} />;
}
