"use client";

import { authStore } from "@/auth/store";
import { persistStoppedPractice } from "@/practice/persistStoppedPractice";
import { practiceStore, usePractice } from "@/practice/store";
import { watchStoreTransition } from "@/storeWatch";
import { useEffect } from "react";
import { PracticePlayingScreen } from "./PracticePlayingScreen";
import { PracticeSummary } from "./PracticeSummary";

type Props = { categoryCodename: string };

/**
 * Hosts one category's practice session at /practice/[mode]. The category
 * is validated against the known list server-side (see the route's
 * page.tsx, which 404s otherwise).
 */
export function PracticePlay({ categoryCodename }: Props) {
  const practiceState = usePractice((s) => s.state);
  const start = usePractice((s) => s.start);

  // Persist a stopped Practice session locally the moment the store reaches
  // Stopped — tied to the state transition, not to whether the summary renders.
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
    // Entering this route should always yield a fresh run, whether it's a
    // different category or a revisit of the same one — never resume a
    // stale Playing/Stopped state left over from a previous visit. start()
    // unconditionally overwrites the current state, so this also covers
    // abandoning a different category's in-progress run (e.g. navigating
    // straight from one practice URL to another's mid-play); an abandoned
    // run was never persisted anyway, only a Stopped one is.
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
