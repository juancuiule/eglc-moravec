import { describe, it, expect } from "vitest";
import { deriveCurrentScreen } from "./screen";
import type { GameState, Playing, Finished } from "./game/index";
import type { PracticeState, PracticePlaying, PracticeStopped } from "./practice/index";
import type { AuthState } from "./auth/index";

const loading: GameState = { type: "loading" };
const playing = { type: "playing" } as unknown as Playing;
const finished = { type: "finished" } as unknown as Finished;

const idle: PracticeState = { type: "idle" };
const practicePlaying = { type: "playing" } as unknown as PracticePlaying;
const practiceStopped = { type: "stopped" } as unknown as PracticeStopped;

const loggedOut: AuthState = { type: "idle" };
const loggedIn: AuthState = { type: "loggedIn", token: "t", email: "a@b.com" };

describe("deriveCurrentScreen", () => {
  it("shows level selection when idle and nav is menu", () => {
    expect(deriveCurrentScreen(loading, idle, loggedOut, "menu")).toEqual({ type: "levelSelection" });
  });

  it("shows the level in progress when nav is menu and the game is playing", () => {
    expect(deriveCurrentScreen(playing as GameState, idle, loggedOut, "menu")).toEqual({
      type: "levelPlaying",
      state: playing,
    });
  });

  it("shows the finished level when nav is menu and the game is finished", () => {
    expect(deriveCurrentScreen(finished as GameState, idle, loggedOut, "menu")).toEqual({
      type: "levelFinished",
      state: finished,
    });
  });

  it("shows stats when nav is stats, regardless of game state", () => {
    expect(deriveCurrentScreen(playing as GameState, idle, loggedOut, "stats")).toEqual({ type: "stats" });
  });

  it("shows practice category selection when nav is practice and practice is idle", () => {
    expect(deriveCurrentScreen(loading, idle, loggedOut, "practice")).toEqual({ type: "practiceSelection" });
  });

  it("shows the practice session when nav is practice and practice is playing", () => {
    expect(deriveCurrentScreen(loading, practicePlaying as PracticeState, loggedOut, "practice")).toEqual({
      type: "practicePlaying",
      state: practicePlaying,
    });
  });

  it("shows the practice summary when nav is practice and practice is stopped", () => {
    expect(deriveCurrentScreen(loading, practiceStopped as PracticeState, loggedOut, "practice")).toEqual({
      type: "practiceStopped",
      state: practiceStopped,
    });
  });

  it("practice nav takes priority over an in-progress level", () => {
    expect(
      deriveCurrentScreen(playing as GameState, practicePlaying as PracticeState, loggedOut, "practice"),
    ).toEqual({
      type: "practicePlaying",
      state: practicePlaying,
    });
  });

  it("shows the login screen when nav is login and logged out", () => {
    expect(deriveCurrentScreen(loading, idle, loggedOut, "login")).toEqual({ type: "login" });
  });

  it("falls through to the menu when nav is login but already logged in", () => {
    expect(deriveCurrentScreen(loading, idle, loggedIn, "login")).toEqual({ type: "levelSelection" });
  });

  it("shows the admin screen when nav is admin, regardless of game/practice/auth state", () => {
    expect(deriveCurrentScreen(playing as GameState, practicePlaying as PracticeState, loggedIn, "admin")).toEqual({
      type: "admin",
    });
  });
});
