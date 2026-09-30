"use client";

import { authStore } from "@/auth/store";
import { persistStoppedPractice } from "@/practice/persistStoppedPractice";
import { practiceConfigKey, type PracticeConfig } from "@/practice";
import { practiceStore, usePractice } from "@/practice/store";
import { watchStoreTransition } from "@/storeWatch";
import { useEffect } from "react";
import { PracticePlayingScreen } from "./PracticePlayingScreen";
import { PracticeSummary } from "./PracticeSummary";

type Props = { config: PracticeConfig };

export function PracticePlay({ config }: Props) {
  const practiceState = usePractice((s) => s.state);
  const start = usePractice((s) => s.start);

  // Restart identity, not object identity: a Focus config's weights get a
  // fresh object whenever history is re-derived, but the same mode is the
  // same session — a new weights object must not bounce an in-progress run.
  const configKey = practiceConfigKey(config);

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

  useEffect(() => {
    const state = practiceStore.getState().state;
    if (state.type !== "idle") practiceStore.getState().reset();
    start(config);
    // Deps key on configKey, not config — see above. On a key change the
    // latest render's config is what start() sees.
  }, [configKey, start]);

  const { type } = practiceState;

  switch (type) {
    case "playing": {
      if (practiceConfigKey(practiceState.config) === configKey) {
        return <PracticePlayingScreen state={practiceState} />;
      }
      break;
    }
    case "stopped": {
      if (practiceConfigKey(practiceState.config) === configKey) {
        return <PracticeSummary state={practiceState} />;
      }
      break;
    }
  }

  return null; // briefly, while the effect above catches up
}
