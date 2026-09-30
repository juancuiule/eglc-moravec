"use client";

import { useTranslations } from "next-intl";
import {
  useLocalHydrated,
  useLocalLevelMix,
  useLocalLevelNumbers,
} from "@/local/hooks";
import { LevelPlay } from "./LevelPlay";
import { LoadingPanel } from "./LoadingPanel";
import { OfflineNotice } from "./OfflineNotice";

/**
 * The local-data version of /level/[n] — rendered when the page's Server
 * Component couldn't reach the backend, and by the offline app shell when a
 * level URL is opened with no cached document. Everything LevelPlay needs
 * comes from the local catalog snapshot + read model; its own unlock gate
 * still applies (a locally-locked level redirects like normal).
 */
export function LocalLevelPlay({ levelNumber }: { levelNumber: number }) {
  const t = useTranslations("Levels");
  const tOffline = useTranslations("Offline");
  const hydrated = useLocalHydrated();
  const mix = useLocalLevelMix(levelNumber);
  const catalog = useLocalLevelNumbers();

  if (!hydrated || mix === undefined || catalog === undefined) {
    return <LoadingPanel label={t("loading")} />;
  }
  if (mix === null)
    return <OfflineNotice message={tOffline("levelUnavailable")} />;

  // A level dropped from the catalog stays playable — its cached mix and
  // history still exist — it just has no "next" (spec: cache, not mirror).
  const index = catalog?.indexOf(levelNumber) ?? -1;
  const nextLevelNumber = index === -1 ? null : (catalog?.[index + 1] ?? null);

  return (
    <LevelPlay
      levelNumber={levelNumber}
      level={mix}
      stats={{}}
      nextLevelNumber={nextLevelNumber}
    />
  );
}
