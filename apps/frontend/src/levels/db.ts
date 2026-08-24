import { addRxPlugin, createRxDatabase, type RxCollection, type RxDatabase, type RxStorage } from "rxdb";
import { getRxStorageDexie } from "rxdb/plugins/storage-dexie";
import { wrappedValidateAjvStorage } from "rxdb/plugins/validate-ajv";
import { levelSchema, type LevelDocType } from "./schema";

export type LevelsCollections = {
  levels: RxCollection<LevelDocType>;
};

export type LevelsDatabase = RxDatabase<LevelsCollections>;

async function enableDevMode(): Promise<void> {
  if (process.env.NODE_ENV === "production") return;
  const { RxDBDevModePlugin } = await import("rxdb/plugins/dev-mode");
  addRxPlugin(RxDBDevModePlugin);
}

/**
 * Schema validation only runs outside production, matching RxDB's own dev-mode
 * plugin: its checks are meant to be stripped from production builds for
 * bundle size and runtime cost, not something this reference-data collection
 * needs once it has shipped validated.
 */
function storageFor(baseStorage: RxStorage<unknown, unknown>): RxStorage<unknown, unknown> {
  if (process.env.NODE_ENV === "production") return baseStorage;
  return wrappedValidateAjvStorage({ storage: baseStorage });
}

export async function createLevelsDatabase(
  storage: RxStorage<unknown, unknown>,
  name = "moravec-levels",
): Promise<LevelsDatabase> {
  await enableDevMode();
  const db = await createRxDatabase<LevelsCollections>({
    name,
    storage: storageFor(storage),
  });
  await db.addCollections({
    levels: { schema: levelSchema },
  });
  return db;
}

let dbPromise: Promise<LevelsDatabase> | null = null;

/**
 * Lazily creates the one Levels database instance, backed by IndexedDB (via
 * Dexie). On failure, clears the cached promise so the next call gets a
 * fresh attempt instead of replaying the same rejection forever (e.g. a
 * transient IndexedDB-blocked state that later clears).
 */
export function getLevelsDatabase(): Promise<LevelsDatabase> {
  if (!dbPromise) {
    dbPromise = createLevelsDatabase(getRxStorageDexie()).catch((error: unknown) => {
      dbPromise = null;
      throw error;
    });
  }
  return dbPromise;
}
