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

// Split from the store reads so reactive callers can memoize on the raw
// cell/value string — JSON.parse allocates a fresh object every call, which
// would otherwise make hook results unstable across renders.

// null = no catalog snapshot yet (never warmed).
export function parseLevelNumbers(raw: unknown): number[] | null {
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

export function localLevelNumbers(): number[] | null {
  return parseLevelNumbers(localStore.getValue(LEVEL_NUMBERS_VALUE));
}

// The cached mix for one level number, validated on read the same way the
// backend validates the catalog at boot — a corrupt or hand-edited cell
// must not reach createOperation mid-play; it reads as "not cached" instead.
export function parseLevelMix(raw: unknown): Record<string, number> | null {
  if (typeof raw !== "string") return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const entries = Object.entries(parsed);
    // Mirrors assertLevelMixesAreValid on the backend: a mix of only
    // zero-weight entries would pass the per-entry check but throw inside
    // pickRandomWeighted on the first trial — reject it as not-cached here.
    const totalWeight = entries.reduce(
      (sum, [, weight]) => sum + (weight as number),
      0,
    );
    const valid =
      entries.length > 0 &&
      entries.every(
        ([codename, weight]) =>
          isSupportedCategoryCodename(codename) &&
          typeof weight === "number" &&
          Number.isFinite(weight) &&
          weight >= 0,
      ) &&
      Number.isFinite(totalWeight) &&
      totalWeight > 0;
    if (!valid) {
      console.warn("localFirst: dropping invalid cached level mix", {
        raw: String(raw).slice(0, 120),
      });
      return null;
    }
    return parsed as Record<string, number>;
  } catch {
    return null;
  }
}

export function localLevelMix(
  levelNumber: number,
): Record<string, number> | null {
  return parseLevelMix(
    localStore.getCell(LEVELS_TABLE, String(levelNumber), "mix"),
  );
}

// Best-effort background refresh — fired at boot, on `online`, and after
// every settled sync pass (the endpoint is public, so it must not wait on
// session/sync success); never awaited. A failed fetch just means the last
// snapshot stands; writes defer past IndexedDB hydration like every other
// store write. Overlapping refreshes race network responses, so ordering is
// tracked by the last APPLIED generation: a response writes unless a newer
// successful response already did — a newer fetch that fails never makes a
// usable older response get discarded.
let refreshGen = 0;
let appliedGen = 0;

export async function refreshLevelCatalog(): Promise<void> {
  const gen = ++refreshGen;
  let levels: { levelNumber: number; mix: Record<string, number> }[];
  try {
    levels = await Api.fetchAllLevels();
  } catch {
    return;
  }
  if (gen <= appliedGen) return;
  appliedGen = gen;
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
