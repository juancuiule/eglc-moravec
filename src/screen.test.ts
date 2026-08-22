import { describe, it, expect } from "vitest";
import { deriveCurrentScreen } from "./screen";
import type { GameState, Playing, Finished } from "./game/index";
import type { PracticeState, PracticePlaying, PracticeStopped } from "./practice/index";

const loading: GameState = { type: "loading" };
const playing = { type: "playing" } as unknown as Playing;
const finished = { type: "finished" } as unknown as Finished;

const idle: PracticeState = { type: "idle" };
const practicePlaying = { type: "playing" } as unknown as PracticePlaying;
const practiceStopped = { type: "stopped" } as unknown as PracticeStopped;

describe("deriveCurrentScreen", () => {
  it("shows level selection when idle and nav is menu", () => {
    expect(deriveCurrentScreen(loading, idle, "menu")).toEqual({ type: "levelSelection" });
  });

  it("shows the level in progress when nav is menu and the game is playing", () => {
    expect(deriveCurrentScreen(playing as GameState, idle, "menu")).toEqual({
      type: "levelPlaying",
      state: playing,
    });
  });

  it("shows the finished level when nav is menu and the game is finished", () => {
    expect(deriveCurrentScreen(finished as GameState, idle, "menu")).toEqual({
      type: "levelFinished",
      state: finished,
    });
  });

  it("shows stats when nav is stats, regardless of game state", () => {
    expect(deriveCurrentScreen(playing as GameState, idle, "stats")).toEqual({ type: "stats" });
  });

  it("shows practice category selection when nav is practice and practice is idle", () => {
    expect(deriveCurrentScreen(loading, idle, "practice")).toEqual({ type: "practiceSelection" });
  });

  it("shows the practice session when nav is practice and practice is playing", () => {
    expect(deriveCurrentScreen(loading, practicePlaying as PracticeState, "practice")).toEqual({
      type: "practicePlaying",
      state: practicePlaying,
    });
  });

  it("shows the practice summary when nav is practice and practice is stopped", () => {
    expect(deriveCurrentScreen(loading, practiceStopped as PracticeState, "practice")).toEqual({
      type: "practiceStopped",
      state: practiceStopped,
    });
  });

  it("practice nav takes priority over an in-progress level", () => {
    expect(deriveCurrentScreen(playing as GameState, practicePlaying as PracticeState, "practice")).toEqual({
      type: "practicePlaying",
      state: practicePlaying,
    });
  });
});
