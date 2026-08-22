import { useState } from "react";
import { useGame } from "./game/store";
import { usePractice } from "./practice/store";
import { deriveCurrentScreen, type NavScreen } from "./screen";
import { LevelSelection } from "./components/LevelSelection";
import { AnsweringView } from "./components/AnsweringView";
import { FinishedScreen } from "./components/FinishedScreen";
import { StatsScreen } from "./components/StatsScreen";
import { PracticeModeSelection } from "./components/PracticeModeSelection";
import { PracticePlayingScreen } from "./components/PracticePlayingScreen";
import { PracticeSummary } from "./components/PracticeSummary";

export function App() {
  const gameState = useGame((s) => s.state);
  const practiceState = usePractice((s) => s.state);
  const [nav, setNav] = useState<NavScreen>("menu");

  const screen = deriveCurrentScreen(gameState, practiceState, nav);

  switch (screen.type) {
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
