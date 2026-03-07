import { useState, useEffect, useRef } from "react";
import type { Playing } from "../game/index";
import { useGame } from "../game/store";

type Props = { state: Playing };

const ROWS = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  ["C", "0", "⌫"],
];

export function AnsweringView({ state }: Props) {
  const submitAnswer = useGame((s) => s.submitAnswer);
  const timeUp = useGame((s) => s.timeUp);
  const advance = useGame((s) => s.advance);

  const playingState = state.playingState;
  const operation = state.currentOperation;
  const solveTime = operation.solveTime();

  const [answer, setAnswer] = useState("");
  const [pressedKey, setPressedKey] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(solveTime);
  const answerRef = useRef("");

  // Reset state on each new trial
  useEffect(() => {
    setAnswer("");
    answerRef.current = "";
    setPressedKey(null);
    setRemaining(solveTime);
  }, [state.trialId, solveTime]);

  // Countdown timer — only active while answering
  const startedAt =
    playingState.type === "answering" ? playingState.startedAt : null;

  useEffect(() => {
    if (startedAt === null) return;
    const id = setInterval(() => {
      const left = Math.max(0, solveTime - (Date.now() - startedAt));
      setRemaining(left);
      if (left === 0) {
        clearInterval(id);
        timeUp();
      }
    }, 100);
    return () => clearInterval(id);
  }, [startedAt, solveTime, timeUp]);

  // Auto-advance after showing feedback
  useEffect(() => {
    if (playingState.type !== "reviewing") return;
    const id = setTimeout(() => advance(), 1000);
    return () => clearTimeout(id);
  }, [playingState.type, advance]);

  // Keyboard input — only active while answering
  useEffect(() => {
    if (playingState.type !== "answering") return;
    function onKeyDown(e: KeyboardEvent) {
      if (/^\d$/.test(e.key)) {
        press(e.key);
        setAnswer((prev) => (prev.length < 10 ? prev + e.key : prev));
        answerRef.current =
          answerRef.current.length < 10
            ? answerRef.current + e.key
            : answerRef.current;
      } else if (e.key === "Backspace") {
        press("⌫");
        setAnswer((prev) => prev.slice(0, -1));
        answerRef.current = answerRef.current.slice(0, -1);
      } else if (e.key === "Delete") {
        press("C");
        setAnswer("");
        answerRef.current = "";
      } else if (e.key === "Enter") {
        doSubmit();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [playingState.type, submitAnswer]); // eslint-disable-line react-hooks/exhaustive-deps

  function press(key: string) {
    setPressedKey(key);
    setTimeout(() => setPressedKey((k) => (k === key ? null : k)), 150);
  }

  function handleButton(key: string) {
    press(key);
    if (key === "C") {
      setAnswer("");
      answerRef.current = "";
    } else if (key === "⌫") {
      setAnswer((prev) => prev.slice(0, -1));
      answerRef.current = answerRef.current.slice(0, -1);
    } else {
      setAnswer((prev) => (prev.length < 10 ? prev + key : prev));
      answerRef.current =
        answerRef.current.length < 10
          ? answerRef.current + key
          : answerRef.current;
    }
  }

  function doSubmit() {
    const parsed = parseInt(answerRef.current, 10);
    if (answerRef.current !== "" && !isNaN(parsed)) submitAnswer(parsed);
  }

  const isReviewing = playingState.type === "reviewing";
  const result = isReviewing ? playingState.result : null;

  // Freeze the ratio at the moment of submission — bar fades out, never jumps to 0
  const ratio = remaining / solveTime;
  const timerColor =
    ratio > 0.5 ? "#4ade80" : ratio > 0.25 ? "#facc15" : "#f87171";
  const seconds = Math.ceil(remaining / 1000);

  return (
    <div className="bg-[#1a1a24] border border-[#2e2e42] rounded-2xl p-6 w-full max-w-[380px] flex flex-col gap-5">
      {/* Header */}
      <div className="flex justify-between items-center text-sm text-[#a0a0c0]">
        <span>
          Trial {state.trialsConsumed + 1} / {state.config.totalTrials}
        </span>
        {/* Fade out seconds when reviewing so it doesn't tick to 0 */}
        <span className={`transition-opacity duration-300 ${isReviewing ? "opacity-0" : "opacity-100"}`}>
          {seconds}s
        </span>
      </div>

      {/* Timer bar — fades out on submit instead of jumping to 0 */}
      <div className={`h-1.5 bg-[#2e2e42] rounded-full overflow-hidden transition-opacity duration-300 ${isReviewing ? "opacity-0" : "opacity-100"}`}>
        <div
          className="h-full rounded-full transition-[width] duration-100 ease-linear"
          style={{ width: `${ratio * 100}%`, backgroundColor: timerColor }}
        />
      </div>

      {/* Operation */}
      <div className="text-5xl font-bold text-center tracking-tight py-1">
        {operation.humanReadable()}
      </div>

      {/* Calculator section — always rendered to prevent layout shift.
          Feedback overlay sits on top via absolute positioning. */}
      <div className="relative flex flex-col gap-3">
        {/* Answer display */}
        <div className="bg-[#0f0f13] border border-[#2e2e42] rounded-xl px-4 py-3 text-right text-3xl font-mono min-h-[3.5rem] flex items-center justify-end select-none">
          {answer || <span className="text-[#3e3e52]">0</span>}
        </div>

        {/* Keypad */}
        <div className="grid grid-cols-3 gap-2">
          {ROWS.flat().map((key) => {
            const isAction = key === "C" || key === "⌫";
            const isPressed = pressedKey === key;
            return (
              <button
                key={key}
                onPointerDown={() => handleButton(key)}
                className={[
                  "h-14 rounded-xl font-semibold text-xl cursor-pointer select-none",
                  "transition-all duration-100",
                  isAction
                    ? "bg-[#2e2e42] text-[#a0a0c0] hover:bg-[#3a3a52]"
                    : "bg-[#0f0f13] border border-[#2e2e42] text-[#e8e8f0] hover:border-[#5a5af0] hover:text-[#5a5af0]",
                  isPressed ? "scale-90 brightness-150" : "",
                ].join(" ")}
              >
                {key}
              </button>
            );
          })}
        </div>

        {/* Submit */}
        <button
          className="cursor-pointer bg-[#5a5af0] text-white w-full rounded-xl py-3 font-semibold text-lg hover:opacity-90 active:scale-[0.97] disabled:opacity-30 disabled:cursor-not-allowed transition-opacity"
          disabled={!answer}
          onPointerDown={doSubmit}
        >
          Submit
        </button>

        {/* Feedback overlay — absolute over the calculator, no layout shift */}
        {isReviewing && result && (
          <div
            className={[
              "absolute inset-0 rounded-xl flex flex-col items-center justify-center gap-1 font-semibold",
              result.correct
                ? "bg-[#0d2b1a]/95 text-[#4ade80] border border-[#166534]"
                : "bg-[#2b0d0d]/95 text-[#f87171] border border-[#7f1d1d]",
            ].join(" ")}
          >
            <span className="text-3xl">
              {result.correct
                ? "Correct"
                : result.answer === null
                  ? "Time's up"
                  : "Wrong"}
            </span>
            {!result.correct && (
              <span className="text-sm opacity-70">
                = {result.operation.result()}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
