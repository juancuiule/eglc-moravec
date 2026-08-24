import { notFound } from "next/navigation";
import { isTutorialTopic } from "@/tutorials/content";
import { Centered } from "@/components/Centered";
import { TutorialDetail } from "@/components/TutorialDetail";

type Props = { params: Promise<{ type: string }> };

export default async function TutorialPage({ params }: Props) {
  const { type } = await params;
  if (!isTutorialTopic(type)) notFound();

  return (
    <Centered>
      <TutorialDetail topic={type} />
    </Centered>
  );
}
