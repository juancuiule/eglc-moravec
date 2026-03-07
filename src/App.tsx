import { useState } from "react";
import { useGame } from "./game/store";
import { LevelSelection } from "./components/LevelSelection";
import { PlayingScreen } from "./components/PlayingScreen";
import { FinishedScreen } from "./components/FinishedScreen";
import { StatsScreen } from "./components/StatsScreen";

type AppScreen = "menu" | "stats";

export function App() {
  const state = useGame((s) => s.state);
  const [screen, setScreen] = useState<AppScreen>("menu");

  return (
    <div className="min-h-dvh flex items-center justify-center p-6 bg-[#0f0f13] text-[#e8e8f0] font-sans">
      {state.type === "loading" && screen === "stats" && (
        <StatsScreen onBack={() => setScreen("menu")} />
      )}
      {state.type === "loading" && screen === "menu" && (
        <LevelSelection onShowStats={() => setScreen("stats")} />
      )}
      {state.type === "playing" && <PlayingScreen state={state} />}
      {state.type === "finished" && (
        <FinishedScreen state={state} onBack={() => setScreen("menu")} />
      )}
    </div>
  );
}
