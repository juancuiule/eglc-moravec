import {
  addRxPlugin,
  createRxDatabase,
  type RxCollection,
  type RxDatabase,
  type RxStorage,
} from "rxdb";
import { getRxStorageDexie } from "rxdb/plugins/storage-dexie";
import { wrappedValidateAjvStorage } from "rxdb/plugins/validate-ajv";
import { levelSchema, type LevelDocType } from "../levels/schema";
import { trialResultSchema, type TrialResultDocType } from "../sync/trialResults/schema";
import { levelStatsSchema, type LevelStatsDocType } from "../sync/levelStats/schema";
import { insecureContextHashFunction } from "./hashFunction";

// One shared database for the whole app — every local-first collection
// lives here, so there is exactly one RxDatabaseProvider to set up at the root.
export type AppCollections = {
  levels: RxCollection<LevelDocType>;
  trialResults: RxCollection<TrialResultDocType>;
  levelStats: RxCollection<LevelStatsDocType>;
};

export type AppDatabase = RxDatabase<AppCollections>;

async function enableDevMode(): Promise<void> {
  if (process.env.NODE_ENV === "production") return;
  const { RxDBDevModePlugin } = await import("rxdb/plugins/dev-mode");
  addRxPlugin(RxDBDevModePlugin);
}

/**
 * Schema validation only runs outside production, matching RxDB's own dev-mode
 * plugin: its checks are meant to be stripped from production builds for
 * bundle size and runtime cost.
 */
function storageFor(baseStorage: RxStorage<unknown, unknown>): RxStorage<unknown, unknown> {
  if (process.env.NODE_ENV === "production") return baseStorage;
  return wrappedValidateAjvStorage({ storage: baseStorage });
}

export async function createAppDatabase(
  storage: RxStorage<unknown, unknown>,
  name = "moravec",
): Promise<AppDatabase> {
  await enableDevMode();
  const db = await createRxDatabase<AppCollections>({
    name,
    storage: storageFor(storage),
    hashFunction: insecureContextHashFunction,
    // Next.js dev-mode Fast Refresh can re-run this module without a full
    // page reload, which would otherwise try to create a second database
    // under the same name and throw — close the earlier one instead.
    closeDuplicates: true,
  });
  await db.addCollections({
    levels: { schema: levelSchema },
    trialResults: { schema: trialResultSchema },
    levelStats: { schema: levelStatsSchema },
  });
  return db;
}

let dbPromise: Promise<AppDatabase> | null = null;

/**
 * Lazily creates the one app-wide database instance, backed by IndexedDB
 * (via Dexie). On failure, clears the cached promise so the next call gets a
 * fresh attempt instead of replaying the same rejection forever (e.g. a
 * transient IndexedDB-blocked state that later clears).
 */
export function getAppDatabase(): Promise<AppDatabase> {
  if (!dbPromise) {
    dbPromise = createAppDatabase(getRxStorageDexie()).catch((error: unknown) => {
      dbPromise = null;
      throw error;
    });
  }
  return dbPromise;
}
