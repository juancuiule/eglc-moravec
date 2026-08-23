"use client";

import { useEffect } from "react";
import { usePractice, practiceStore } from "@/practice/store";
import { watchStoreTransition } from "@/storeWatch";
import { persistStoppedPractice } from "@/practice/persistStoppedPractice";
import { Centered } from "@/components/Centered";
import { PracticeModeSelection } from "@/components/PracticeModeSelection";
import { PracticePlayingScreen } from "@/components/PracticePlayingScreen";
import { PracticeSummary } from "@/components/PracticeSummary";

export default function PracticePage() {
  const practiceState = usePractice((s) => s.state);

  // Persist a stopped Practice session locally the moment the store reaches
  // Stopped — tied to the state transition, not to whether the summary renders.
  useEffect(() => {
    return watchStoreTransition(
      practiceStore,
      (s) => s.state.type === "stopped",
      (s) => {
        if (s.state.type !== "stopped") return;
        persistStoppedPractice(s.state);
      },
    );
  }, []);

  if (practiceState.type === "playing") {
    return (
      <Centered>
        <PracticePlayingScreen state={practiceState} />
      </Centered>
    );
  }

  if (practiceState.type === "stopped") {
    return (
      <Centered>
        <PracticeSummary state={practiceState} />
      </Centered>
    );
  }

  return (
    <Centered>
      <PracticeModeSelection />
    </Centered>
  );
}
