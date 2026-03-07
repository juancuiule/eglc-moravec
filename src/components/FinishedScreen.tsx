import type { Finished } from "../game/index";
import { useGame } from "../game/store";

type Props = { state: Finished };

export function FinishedScreen({ state }: Props) {
  const reset = useGame((s) => s.reset);
  const { results } = state;
  const correct = results.filter((r) => r.correct).length;

  return (
    <div className="bg-[#1a1a24] border border-[#2e2e42] rounded-2xl p-8 w-full max-w-[480px] flex flex-col gap-6">
      <h1 className="text-2xl font-bold tracking-tight">Results</h1>

      <p className="text-xl font-bold text-center">
        <span className="text-[#5a5af0]">{correct}</span> / {results.length} correct
      </p>

      <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto pr-1">
        {results.map((r, i) => (
          <div
            key={i}
            className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-3 py-2 rounded-lg bg-[#0f0f13] text-sm"
          >
            <span className="font-semibold">{r.operation.humanReadable()}</span>
            <span className="text-[#a0a0c0]">
              {r.answer === null ? "—" : `${r.answer}`}
            </span>
            <span className={r.correct ? "text-[#4ade80]" : "text-[#f87171]"}>
              {r.correct ? "✓" : "✗"}
            </span>
          </div>
        ))}
      </div>

      <button
        className="cursor-pointer bg-[#5a5af0] text-white w-full rounded-lg px-5 py-2.5 font-semibold hover:opacity-90 active:scale-[0.97] transition-opacity"
        onClick={reset}
      >
        Play again
      </button>
    </div>
  );
}
