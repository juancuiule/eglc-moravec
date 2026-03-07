import { useGame } from "./game/store";
import { StartScreen } from "./components/StartScreen";
import { PlayingScreen } from "./components/PlayingScreen";
import { FinishedScreen } from "./components/FinishedScreen";

export function App() {
  const state = useGame((s) => s.state);

  return (
    <div className="min-h-dvh flex items-center justify-center p-6 bg-[#0f0f13] text-[#e8e8f0] font-sans">
      {state.type === "loading" && <StartScreen />}
      {state.type === "playing" && <PlayingScreen state={state} />}
      {state.type === "finished" && <FinishedScreen state={state} />}
    </div>
  );
}
