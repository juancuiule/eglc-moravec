import { useState } from "react";
import { useGame } from "../game/store";
import { LEVELS } from "../LEVELS";

const LEVEL_KEYS = Object.keys(LEVELS) as (keyof typeof LEVELS)[];

const inputCls =
  "bg-[#0f0f13] border border-[#2e2e42] rounded-lg text-[#e8e8f0] px-3 py-2 text-base w-full outline-none focus:border-[#5a5af0] transition-colors";

export function StartScreen() {
  const load = useGame((s) => s.load);
  const [levelKey, setLevelKey] = useState(LEVEL_KEYS[0]);
  const [nTrials, setNTrials] = useState(10);

  function handleStart() {
    load({ level: LEVELS[levelKey], nTrials });
  }

  return (
    <div className="bg-[#1a1a24] border border-[#2e2e42] rounded-2xl p-8 w-full max-w-[480px] flex flex-col gap-6">
      <h1 className="text-2xl font-bold tracking-tight">Mental Math</h1>

      <label className="flex flex-col gap-1.5 text-sm text-[#a0a0c0] font-medium">
        Level
        <select
          className={inputCls}
          value={levelKey}
          onChange={(e) => setLevelKey(e.target.value)}
        >
          {LEVEL_KEYS.map((k) => (
            <option key={k} value={k}>
              Level {k}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1.5 text-sm text-[#a0a0c0] font-medium">
        Number of trials
        <input
          className={inputCls}
          type="number"
          min={1}
          max={50}
          value={nTrials}
          onChange={(e) => setNTrials(Math.max(1, parseInt(e.target.value) || 1))}
        />
      </label>

      <button
        className="cursor-pointer bg-[#5a5af0] text-white w-full rounded-lg px-5 py-2.5 font-semibold hover:opacity-90 active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
        onClick={handleStart}
      >
        Start
      </button>
    </div>
  );
}
