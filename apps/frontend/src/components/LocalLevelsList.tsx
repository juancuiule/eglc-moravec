"use client";

import { useTranslations } from "next-intl";
import { useLocalHydrated, useLocalLevelNumbers } from "@/local/hooks";
import { LevelsList } from "./LevelsList";
import { LoadingPanel } from "./LoadingPanel";
import { OfflineNotice } from "./OfflineNotice";

/**
 * The local-data version of /levels — the catalog's number list comes from
 * the local snapshot instead of GET /levels. Records and unlock state are
 * already local-first inside LevelsList, so no seed is needed here.
 */
export function LocalLevelsList() {
  const t = useTranslations("Levels");
  const tOffline = useTranslations("Offline");
  const hydrated = useLocalHydrated();
  const levelKeys = useLocalLevelNumbers();

  if (!hydrated || levelKeys === undefined) {
    return <LoadingPanel label={t("loading")} />;
  }
  if (levelKeys === null)
    return <OfflineNotice message={tOffline("catalogUnavailable")} />;
  return <LevelsList levelKeys={levelKeys} stats={{}} />;
}
