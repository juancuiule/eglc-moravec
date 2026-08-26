"use client";

import { useEffect } from "react";
import { usePractice, practiceStore } from "@/practice/store";
import { watchStoreTransition } from "@/storeWatch";
import { persistStoppedPractice } from "@/practice/persistStoppedPractice";
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
        persistStoppedPractice(s.state);
      },
    );
  }, []);

  useEffect(() => {
    const state = practiceStore.getState().state;
    const alreadyThisCategory =
      state.type !== "idle" &&
      state.config.categoryCodename === categoryCodename;
    if (alreadyThisCategory) return;

    // Abandon a different category's in-progress run first (e.g. navigating
    // straight from one practice URL to another's mid-play). An abandoned
    // run was never persisted anyway, only a Stopped one is.
    start({ categoryCodename });
  }, [categoryCodename, start]);

  if (
    practiceState.type === "playing" &&
    practiceState.config.categoryCodename === categoryCodename
  ) {
    return <PracticePlayingScreen state={practiceState} />;
  }

  if (
    practiceState.type === "stopped" &&
    practiceState.config.categoryCodename === categoryCodename
  ) {
    return <PracticeSummary state={practiceState} />;
  }

  return null; // briefly, while the effect above catches up
}
