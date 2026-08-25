import { describe, expect, it, vi } from "vitest";
import { Subject } from "rxjs";
import { startAllReplications } from "./replication";
import { startLevelCatalogReplication } from "../levels/replication";
import { startTrialResultsReplication } from "../sync/trialResults/replication";
import { startLevelStatsReplication } from "../sync/levelStats/replication";
import type { AppDatabase } from "./database";

vi.mock("../levels/replication", () => ({ startLevelCatalogReplication: vi.fn() }));
vi.mock("../sync/trialResults/replication", () => ({ startTrialResultsReplication: vi.fn() }));
vi.mock("../sync/levelStats/replication", () => ({ startLevelStatsReplication: vi.fn() }));

describe("startAllReplications", () => {
  it("re-syncs Level-stats the moment a Trial-results push is confirmed", () => {
    const sent$ = new Subject<unknown>();
    const reSync = vi.fn();
    vi.mocked(startTrialResultsReplication).mockReturnValue({ sent$ } as never);
    vi.mocked(startLevelStatsReplication).mockReturnValue({ reSync } as never);

    startAllReplications({} as AppDatabase);
    expect(reSync).not.toHaveBeenCalled();

    sent$.next({});
    expect(reSync).toHaveBeenCalledTimes(1);

    sent$.next({});
    expect(reSync).toHaveBeenCalledTimes(2);
  });

  it("still starts the Level catalog replication", () => {
    vi.mocked(startTrialResultsReplication).mockReturnValue({ sent$: new Subject() } as never);
    vi.mocked(startLevelStatsReplication).mockReturnValue({ reSync: vi.fn() } as never);

    startAllReplications({} as AppDatabase);

    expect(startLevelCatalogReplication).toHaveBeenCalled();
  });
});
