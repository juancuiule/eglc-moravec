import { act, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { LevelsList } from "./LevelsList";
import type { LevelStats, SyncedTrial } from "@/api/Api";
import { localStore, resetLocalData, TRIALS_TABLE } from "@/local/store";
import { mergeServerTrials } from "@/local/trials";
import { renderWithIntl as render } from "@/testUtils/renderWithIntl";

// Seed a completed Level run in the local store — 20 correct trials under
// one runId is a 3-star record by the engine's own derivation.
function seedLevelRun(levelNumber: number) {
  const runId = crypto.randomUUID();
  const trials: SyncedTrial[] = Array.from({ length: 20 }, (_, i) => ({
    id: crypto.randomUUID(),
    runId,
    runType: "level",
    categoryCodename: "1dx1d",
    levelNumber,
    operands: [2, 3],
    answer: 6,
    correct: true,
    timeExceeded: false,
    timeTaken: 500,
    hintShown: false,
    playedAt: 1_700_000_000_000 + i * 500,
  }));
  mergeServerTrials(trials);
}

beforeEach(() => {
  localStore.delTable(TRIALS_TABLE);
  localStore.setValue("hydrated", true);
});

test("level 1 is unlocked and links to play; level 2 is locked (level 1 has no stars), not a link", async () => {
  render(<LevelsList levelKeys={[1, 2, 3]} />);

  const level1 = await screen.findByRole("link", { name: /Level 1/ });
  expect(level1.getAttribute("href")).toBe("/level/1");

  const level2Row = screen.getByText("Level 2").closest("a, div");
  expect(level2Row?.tagName).toBe("DIV");
  expect(screen.getByText("Level 2").closest("a")).toBeNull();
});

test("level 2 unlocks once level 1 has a locally-stored run — synced or not", async () => {
  seedLevelRun(1);
  render(<LevelsList levelKeys={[1, 2, 3]} />);

  const level2 = await screen.findByRole("link", { name: /Level 2/ });
  expect(level2.getAttribute("href")).toBe("/level/2");
});

const SEED_3STAR: LevelStats = {
  stars: 3,
  totalTime: 5_000,
  completedAt: "2025-01-01T00:00:00Z",
};

test("the server stats seed fills the menu when the local store is empty (fresh browser, failed pull)", async () => {
  render(<LevelsList levelKeys={[1, 2, 3]} stats={{ "1": SEED_3STAR }} />);

  expect(
    (await screen.findByRole("link", { name: /Level 2/ })).getAttribute("href"),
  ).toBe("/level/2");
});

test("a session wipe drops the seed — the menu re-gates locked for the next user", async () => {
  render(<LevelsList levelKeys={[1, 2, 3]} stats={{ "1": SEED_3STAR }} />);
  await screen.findByRole("link", { name: /Level 2/ });

  act(() => resetLocalData()); // logout/expiry boundary

  await waitFor(() =>
    expect(screen.queryByRole("link", { name: /Level 2/ })).toBeNull(),
  );
});

test("a better local record still wins over the seed", async () => {
  seedLevelRun(1); // local 3-star run
  render(
    <LevelsList
      levelKeys={[1, 2, 3]}
      stats={{ "1": { stars: 0, totalTime: 9_999, completedAt: "2024-01-01" } }}
    />,
  );
  // local level-1 record unlocks level 2 regardless of the seed's 0 stars
  expect(await screen.findByRole("link", { name: /Level 2/ })).toBeDefined();
});

// jsdom has no layout: give every row a fixed 50px height stacked by its
// index, the scroller a 400px viewport, and a scrollTop that sticks.
function stubLayout() {
  const proto = HTMLElement.prototype;
  const scrollTops = new WeakMap<Element, number>();
  vi.spyOn(proto, "offsetTop", "get").mockImplementation(function (
    this: HTMLElement,
  ) {
    const siblings = this.parentElement?.children;
    return siblings ? Array.from(siblings).indexOf(this) * 50 : 0;
  });
  vi.spyOn(proto, "clientHeight", "get").mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.classList.contains("overflow-y-auto") ? 400 : 50;
  });
  vi.spyOn(proto, "scrollTop", "get").mockImplementation(function (
    this: HTMLElement,
  ) {
    return scrollTops.get(this) ?? 0;
  });
  vi.spyOn(proto, "scrollTop", "set").mockImplementation(function (
    this: HTMLElement,
    v: number,
  ) {
    scrollTops.set(this, v);
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

const LEVELS_1_TO_20 = Array.from({ length: 20 }, (_, i) => i + 1);
const FIRST_NINE_DONE = Object.fromEntries(
  Array.from({ length: 9 }, (_, i) => [String(i + 1), SEED_3STAR]),
);

test("a long record opens with the next-to-play row centered in the scroller", async () => {
  stubLayout();
  render(<LevelsList levelKeys={LEVELS_1_TO_20} stats={FIRST_NINE_DONE} />);

  const play = await screen.findByRole("link", { name: /Level 10/ });
  // row 10 sits at 9 * 50 = 450; centered in a 400px viewport: 450 - 200 + 25
  expect(play.parentElement?.scrollTop).toBe(275);
});

test("a later unlock doesn't yank the list away from where the player scrolled", async () => {
  stubLayout();
  render(<LevelsList levelKeys={LEVELS_1_TO_20} stats={FIRST_NINE_DONE} />);
  const scroller = (await screen.findByRole("link", { name: /Level 10/ }))
    .parentElement!;
  scroller.scrollTop = 0; // the player scrolls back up to level 1

  act(() => seedLevelRun(10)); // e.g. a background pull lands a level-10 run

  await screen.findByRole("link", { name: /Level 11/ });
  expect(scroller.scrollTop).toBe(0);
});
