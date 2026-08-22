import type { GameState, Playing, Finished } from "./game/index";
import type { PracticeState, PracticePlaying, PracticeStopped } from "./practice/index";
import type { AuthState } from "./auth/index";

export type NavScreen = "menu" | "stats" | "practice" | "login" | "admin";

export type CurrentScreen =
  | { type: "levelSelection" }
  | { type: "stats" }
  | { type: "login" }
  | { type: "admin" }
  | { type: "levelPlaying"; state: Playing }
  | { type: "levelFinished"; state: Finished }
  | { type: "practiceSelection" }
  | { type: "practicePlaying"; state: PracticePlaying }
  | { type: "practiceStopped"; state: PracticeStopped };

/**
 * What's on screen right now, derived from the level game's state, the practice
 * session's state, the auth state, and local nav. Admin nav always wins — it's
 * only ever reached via a direct URL (see App.tsx), never a nav button, so
 * there's nothing else it needs to defer to. Practice nav wins next: a level
 * session can only be mid-play while nav is "menu", since LevelSelection —
 * the only screen that starts a level — itself only renders when nav is "menu".
 * Login nav is skipped once already logged in, falling through to the menu.
 */
export function deriveCurrentScreen(
  gameState: GameState,
  practiceState: PracticeState,
  authState: AuthState,
  nav: NavScreen,
): CurrentScreen {
  if (nav === "admin") return { type: "admin" };

  if (nav === "practice") {
    if (practiceState.type === "playing") {
      return { type: "practicePlaying", state: practiceState };
    }
    if (practiceState.type === "stopped") {
      return { type: "practiceStopped", state: practiceState };
    }
    return { type: "practiceSelection" };
  }

  if (nav === "stats") return { type: "stats" };

  if (nav === "login" && authState.type !== "loggedIn") return { type: "login" };

  if (gameState.type === "playing") return { type: "levelPlaying", state: gameState };
  if (gameState.type === "finished") return { type: "levelFinished", state: gameState };
  return { type: "levelSelection" };
}
