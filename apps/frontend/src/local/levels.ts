import { isSupportedCategoryCodename } from "engine";
import { Api } from "../api/Api";
import { afterHydration, isPersistenceLoading, localStore } from "./store";

// The level catalog's local snapshot — a `levels` table row per level number
// (one `mix` JSON cell, same flat-cell convention as the trials table's
// `operands`) plus the current number list in a store Value. The backend is
// authoritative for the list (it's what /levels renders and nextLevelNumber
// derives from) — but the table is a cache, not a mirror that deletes:
// mixes for numbers dropped from the catalog are kept, since history rows
// still reference them and sync accepts those numbers by design.
export const LEVELS_TABLE = "levels";
export const LEVEL_NUMBERS_VALUE = "levelNumbers";

// null = no catalog snapshot yet (never warmed); distinct from "hydrated
// but empty" only at the read sites, which gate on hydration anyway.
export function localLevelNumbers(): number[] | null {
  const raw = localStore.getValue(LEVEL_NUMBERS_VALUE);
  if (typeof raw !== "string") return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.every((n) => typeof n === "number")
      ? parsed
      : null;
  } catch {
    return null;
  }
}

// The cached mix for one level number, validated on read the same way the
// backend validates the catalog at boot — a corrupt or hand-edited cell
// must not reach createOperation mid-play; it reads as "not cached" instead.
export function localLevelMix(
  levelNumber: number,
): Record<string, number> | null {
  const raw = localStore.getCell(LEVELS_TABLE, String(levelNumber), "mix");
  if (typeof raw !== "string") return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const entries = Object.entries(parsed);
    const valid =
      entries.length > 0 &&
      entries.every(
        ([codename, weight]) =>
          isSupportedCategoryCodename(codename) &&
          typeof weight === "number" &&
          Number.isFinite(weight) &&
          weight >= 0,
      );
    if (!valid) {
      console.warn("localFirst: dropping invalid cached level mix", {
        levelNumber,
      });
      return null;
    }
    return parsed as Record<string, number>;
  } catch {
    return null;
  }
}

// Best-effort background refresh — called after every settled sync pass
// (which includes the boot flush), never awaited. A failed fetch just means
// the last snapshot stands; writes defer past IndexedDB hydration like
// every other store write.
export async function refreshLevelCatalog(): Promise<void> {
  let levels: { levelNumber: number; mix: Record<string, number> }[];
  try {
    levels = await Api.fetchAllLevels();
  } catch {
    return;
  }
  const write = () => {
    localStore.transaction(() => {
      levels.forEach(({ levelNumber, mix }) => {
        const encoded = JSON.stringify(mix);
        // Skip unchanged rows — setRow fires a table listener (and an
        // auto-persist) for every row otherwise.
        if (
          localStore.getCell(LEVELS_TABLE, String(levelNumber), "mix") !==
          encoded
        ) {
          localStore.setRow(LEVELS_TABLE, String(levelNumber), {
            mix: encoded,
          });
        }
      });
      localStore.setValue(
        LEVEL_NUMBERS_VALUE,
        JSON.stringify(levels.map((l) => l.levelNumber)),
      );
    });
  };
  if (isPersistenceLoading()) afterHydration(write);
  else write();
}
