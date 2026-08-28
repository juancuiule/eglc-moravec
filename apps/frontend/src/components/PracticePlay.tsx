"use client";

import { authStore } from "@/auth/store";
import { persistStoppedPractice } from "@/practice/persistStoppedPractice";
import { practiceStore, usePractice } from "@/practice/store";
import { watchStoreTransition } from "@/storeWatch";
import { useEffect } from "react";
import { PracticePlayingScreen } from "./PracticePlayingScreen";
import { PracticeSummary } from "./PracticeSummary";

type Props = { categoryCodename: string };

export function PracticePlay({ categoryCodename }: Props) {
  const practiceState = usePractice((s) => s.state);
  const start = usePractice((s) => s.start);

  useEffect(() => {
    return watchStoreTransition(
      practiceStore,
      (s) => s.state.type === "stopped",
      (s) => {
        if (s.state.type !== "stopped") return;
        persistStoppedPractice(s.state, authStore.getState().state);
      },
    );
  }, []);

  useEffect(() => {
    start({ categoryCodename });
  }, [categoryCodename, start]);

  const { type } = practiceState;

  switch (type) {
    case "playing": {
      const { config } = practiceState;
      if (config.categoryCodename === categoryCodename) {
        return <PracticePlayingScreen state={practiceState} />;
      }
      break;
    }
    case "stopped": {
      const { config } = practiceState;
      if (config.categoryCodename === categoryCodename) {
        return <PracticeSummary state={practiceState} />;
      }
      break;
    }
  }

  return null; // briefly, while the effect above catches up
}
