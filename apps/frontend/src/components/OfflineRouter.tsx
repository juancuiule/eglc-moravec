"use client";

import { useSyncExternalStore } from "react";
import { isSupportedCategoryCodename } from "engine";
import { useTranslations } from "next-intl";
// The app shell routes by URL to client-rendered screens — HomePage is one
// of them, reached via its route module since screens live under app/.
import HomePage from "../../app/page";
import { FOCUS_MODE } from "../practice/focus";
import { FocusPracticePlay } from "./FocusPracticePlay";
import { LocalLevelPlay } from "./LocalLevelPlay";
import { LocalLevelsList } from "./LocalLevelsList";
import { LoadingPanel } from "./LoadingPanel";
import { PracticeModeSelection } from "./PracticeModeSelection";
import { PracticePlay } from "./PracticePlay";
import { StatsScreen } from "./StatsScreen";

const noop = () => () => {};
const getPathname = () => window.location.pathname;
const getServerPathname = () => null;

/**
 * The offline app shell's router. When the service worker can't reach the
 * network and has no cached document for the request URL, it serves the
 * cached /offline document instead — whatever URL the player asked for
 * stays in the address bar, so this component reads the real
 * location.pathname and mounts the local-data version of that screen.
 *
 * Reading the pathname through useSyncExternalStore keeps the server render
 * and hydration identical (LoadingPanel both times) and switches to the
 * routed screen on the first post-mount read.
 */
export function OfflineRouter() {
  const t = useTranslations("Levels");
  const pathname = useSyncExternalStore(noop, getPathname, getServerPathname);

  if (pathname === null) return <LoadingPanel label={t("loading")} />;

  const levelMatch = /^\/level\/(\d+)\/?$/.exec(pathname);
  if (levelMatch) {
    return <LocalLevelPlay levelNumber={Number(levelMatch[1])} />;
  }

  if (pathname === "/levels") return <LocalLevelsList />;
  if (pathname === "/stats") return <StatsScreen />;
  if (pathname === "/practice") return <PracticeModeSelection />;

  const practiceMatch = /^\/practice\/([^/]+)\/?$/.exec(pathname);
  if (practiceMatch) {
    const mode = decodeURIComponent(practiceMatch[1]);
    if (mode === FOCUS_MODE) return <FocusPracticePlay />;
    if (isSupportedCategoryCodename(mode)) {
      return (
        <PracticePlay config={{ mode: "category", categoryCodename: mode }} />
      );
    }
  }

  // Home and anything unroutable offline (/login, /tutorials, …): the menu
  // is fully local-first, and every screen is reachable from it.
  return <HomePage />;
}
