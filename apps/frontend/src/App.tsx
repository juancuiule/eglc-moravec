import { useState, useEffect } from "react";
import { useGame, gameStore } from "./game/store";
import { usePractice, practiceStore } from "./practice/store";
import { useAuth, authStore } from "./auth/store";
import { watchStoreTransition } from "./storeWatch";
import { persistFinishedLevel } from "./game/persistFinishedLevel";
import { persistStoppedPractice } from "./practice/persistStoppedPractice";
import { deriveCurrentScreen, type NavScreen } from "./screen";
import { LevelSelection } from "./components/LevelSelection";
import { AnsweringView } from "./components/AnsweringView";
import { FinishedScreen } from "./components/FinishedScreen";
import { StatsScreen } from "./components/StatsScreen";
import { PracticeModeSelection } from "./components/PracticeModeSelection";
import { PracticePlayingScreen } from "./components/PracticePlayingScreen";
import { PracticeSummary } from "./components/PracticeSummary";
import { LoginScreen } from "./components/LoginScreen";
import { AdminStatsScreen } from "./components/AdminStatsScreen";

// Unlinked — reachable only by navigating directly to /admin, never a nav
// button. The app has no router; this is the one URL-aware check it needs.
function initialNav(): NavScreen {
  return window.location.pathname === "/admin" ? "admin" : "menu";
}

export function App() {
  const gameState = useGame((s) => s.state);
  const practiceState = usePractice((s) => s.state);
  const authState = useAuth((s) => s.state);
  const restoreSession = useAuth((s) => s.restoreSession);
  const [nav, setNav] = useState<NavScreen>(initialNav);

  useEffect(() => {
    void restoreSession();
  }, [restoreSession]);

  // Persist + Sync a Level the moment the game store reaches Finished —
  // tied to the state transition, not to whether FinishedScreen renders.
  useEffect(() => {
    return watchStoreTransition(
      gameStore,
      (s) => s.state.type === "finished",
      (s) => {
        if (s.state.type !== "finished") return;
        persistFinishedLevel(s.state, authStore.getState().state);
      },
    );
  }, []);

  // Same seam, second adapter: persist a Practice session locally when it stops.
  useEffect(() => {
    return watchStoreTransition(
      practiceStore,
      (s) => s.state.type === "stopped",
      (s) => {
        if (s.state.type !== "stopped") return;
        persistStoppedPractice(s.state);
      },
    );
  }, []);

  const screen = deriveCurrentScreen(gameState, practiceState, authState, nav);

  switch (screen.type) {
    case "admin":
      return (
        <Centered>
          <AdminStatsScreen onBack={() => setNav("menu")} />
        </Centered>
      );
    case "practicePlaying":
      return (
        <Centered>
          <PracticePlayingScreen state={screen.state} />
        </Centered>
      );
    case "practiceStopped":
      return (
        <Centered>
          <PracticeSummary state={screen.state} onBack={() => setNav("menu")} />
        </Centered>
      );
    case "practiceSelection":
      return (
        <Centered>
          <PracticeModeSelection onBack={() => setNav("menu")} />
        </Centered>
      );
    case "stats":
      return (
        <Centered>
          <StatsScreen onBack={() => setNav("menu")} />
        </Centered>
      );
    case "login":
      return (
        <Centered>
          <LoginScreen onBack={() => setNav("menu")} />
        </Centered>
      );
    case "levelPlaying":
      return (
        <Centered>
          <AnsweringView state={screen.state} />
        </Centered>
      );
    case "levelFinished":
      return (
        <Centered>
          <FinishedScreen state={screen.state} onBack={() => setNav("menu")} />
        </Centered>
      );
    case "levelSelection":
      return (
        <Centered>
          <LevelSelection
            onShowStats={() => setNav("stats")}
            onShowPractice={() => setNav("practice")}
            onShowLogin={() => setNav("login")}
          />
        </Centered>
      );
    default:
      return screen satisfies never;
  }
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh flex items-center justify-center p-6 bg-[#0f0f13] text-[#e8e8f0] font-sans">
      {children}
    </div>
  );
}
