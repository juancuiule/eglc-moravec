import { beforeEach, describe, expect, it } from "vitest";
import { createGameStore, policy as levelPolicy } from "../game/index";
import { createPracticeStore, practiceRecordPolicy } from "../practice/index";
import { allLocalTrials, pendingInputs } from "../local/trials";
import { localStore, TRIALS_TABLE } from "../local/store";
import { persistScoredTrials } from "./persistScoredTrials";

function levelSetup() {
  const store = createGameStore();
  persistScoredTrials(store, levelPolicy.recordPolicy);
  store.getState().start({
    levelNumber: 3,
    level: { "1d+1d": 100 },
  });
  return store;
}

function currentAnswer(store: ReturnType<typeof createGameStore>): number {
  const { state } = store.getState();
  if (state.type !== "playing") throw new Error("not playing");
  return state.currentOperation.result();
}

describe("persistScoredTrials", () => {
  beforeEach(() => {
    localStore.delTable(TRIALS_TABLE);
    localStore.setValue("hydrated", true);
  });

  it("enqueues a Trial the moment it's scored, before the Level finishes", () => {
    const store = levelSetup();
    store.getState().submitAnswer(currentAnswer(store));

    const pending = pendingInputs();
    expect(pending).toHaveLength(1);
    const { state } = store.getState();
    if (state.type !== "playing" || state.playingState.type !== "reviewing")
      throw new Error("not reviewing");
    expect(pending[0]).toMatchObject({
      id: state.playingState.result.id,
      runId: state.runId,
      runType: "level",
      levelNumber: 3,
    });
  });

  it("keeps a wrong answer even when the run is abandoned right after it (refresh-to-retry)", () => {
    const store = levelSetup();
    store.getState().submitAnswer(currentAnswer(store));
    store.getState().advance();
    store.getState().submitAnswer(currentAnswer(store) + 1); // wrong
    store.getState().reset(); // the run is thrown away, as a reload would

    const trials = allLocalTrials();
    expect(trials.map((t) => t.correct).sort()).toEqual([false, true]);
    expect(new Set(trials.map((t) => t.runId)).size).toBe(1);
  });

  it("enqueues a timed-out Trial too", () => {
    const store = levelSetup();
    store.getState().timeUp(null);
    expect(pendingInputs()).toMatchObject([{ answer: null }]);
  });

  it("enqueues each Trial exactly once, however many updates its review sees", () => {
    const store = levelSetup();
    store.getState().submitAnswer(currentAnswer(store));
    store.getState().requestHint(); // a no-op update while reviewing
    store.setState({ ...store.getState() }); // an unrelated store write
    expect(pendingInputs()).toHaveLength(1);
  });

  it("tags Focus practice Trials as practice_focus", () => {
    const store = createPracticeStore();
    persistScoredTrials(store, practiceRecordPolicy);
    store.getState().start({ mode: "focus", weights: { "1d+1d": 1 } });
    store.getState().timeUp(null);
    expect(pendingInputs()).toMatchObject([
      { runType: "practice_focus", levelNumber: null },
    ]);
  });

  it("tags category practice Trials as practice, with no levelNumber cell", () => {
    const store = createPracticeStore();
    persistScoredTrials(store, practiceRecordPolicy);
    store.getState().start({ mode: "category", categoryCodename: "1d+1d" });
    store.getState().timeUp(null);

    const [[rowId, row]] = Object.entries(localStore.getTable(TRIALS_TABLE));
    expect(row.levelNumber).toBeUndefined(); // absent cell
    expect(pendingInputs()).toMatchObject([
      { id: rowId, runType: "practice", levelNumber: null },
    ]);
  });

  it("stopping Practice mid-review adds no second row for the reviewed Trial", () => {
    const store = createPracticeStore();
    persistScoredTrials(store, practiceRecordPolicy);
    store.getState().start({ mode: "category", categoryCodename: "1d+1d" });
    store.getState().timeUp(null);
    store.getState().stop();
    expect(pendingInputs()).toHaveLength(1);
  });
});
