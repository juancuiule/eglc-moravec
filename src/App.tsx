import { useState } from "react";
import { useGame } from "./game/store";
import { usePractice } from "./practice/store";
import { LevelSelection } from "./components/LevelSelection";
import { PlayingScreen } from "./components/PlayingScreen";
import { FinishedScreen } from "./components/FinishedScreen";
import { StatsScreen } from "./components/StatsScreen";
import { PracticeModeSelection } from "./components/PracticeModeSelection";
import { PracticePlayingScreen } from "./components/PracticePlayingScreen";
import { PracticeSummary } from "./components/PracticeSummary";

type AppScreen = "menu" | "stats" | "practice";

export function App() {
  const gameState = useGame((s) => s.state);
  const practiceState = usePractice((s) => s.state);
  const [screen, setScreen] = useState<AppScreen>("menu");

  // Practice takes over when a session is active
  if (screen === "practice") {
    if (practiceState.type === "playing") {
      return (
        <Centered>
          <PracticePlayingScreen state={practiceState} />
        </Centered>
      );
    }
    if (practiceState.type === "stopped") {
      return (
        <Centered>
          <PracticeSummary state={practiceState} onBack={() => setScreen("menu")} />
        </Centered>
      );
    }
    // idle — show selection
    return (
      <Centered>
        <PracticeModeSelection onBack={() => setScreen("menu")} />
      </Centered>
    );
  }

  if (screen === "stats") {
    return (
      <Centered>
        <StatsScreen onBack={() => setScreen("menu")} />
      </Centered>
    );
  }

  // menu
  if (gameState.type === "playing") {
    return (
      <Centered>
        <PlayingScreen state={gameState} />
      </Centered>
    );
  }
  if (gameState.type === "finished") {
    return (
      <Centered>
        <FinishedScreen state={gameState} onBack={() => setScreen("menu")} />
      </Centered>
    );
  }
  return (
    <Centered>
      <LevelSelection
        onShowStats={() => setScreen("stats")}
        onShowPractice={() => setScreen("practice")}
      />
    </Centered>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh flex items-center justify-center p-6 bg-[#0f0f13] text-[#e8e8f0] font-sans">
      {children}
    </div>
  );
}
