import { useState, useEffect, useRef, type ReactNode } from "react";
import type { Operation } from "../operations/operation";
import type { Answering, BaseTrialResult, Keystroke } from "../trial/engine";
import { HintCard } from "./HintCard";

type ReviewingResult = { type: "reviewing"; result: BaseTrialResult };

type Props = {
  operation: Operation;
  playingState: Answering | ReviewingResult;
  trialId: number;
  hintVisible: boolean;
  onSubmitAnswer: (answer: number, keystrokes: Keystroke[], hasErased: boolean) => void;
  onTimeUp: (keystrokes: Keystroke[], hasErased: boolean) => void;
  onAdvance: () => void;
  /** Left side of the header row (trial count / correct count). */
  headerLeft: ReactNode;
  /** Right side of the header row (hint budget, stop button, …). The countdown sits between the two. */
  headerRight: ReactNode;
  /** Rendered between the timer bar and the operation display (e.g. a category label). */
  beforeOperation?: ReactNode;
  /** Extra line rendered inside the feedback overlay, alongside the correct/wrong message. */
  extraFeedback?: (result: BaseTrialResult) => ReactNode;
};

const ROWS = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  ["C", "0", "⌫"],
];

export function AnsweringPanel({
  operation,
  playingState,
  trialId,
  hintVisible,
  onSubmitAnswer,
  onTimeUp,
  onAdvance,
  headerLeft,
  headerRight,
  beforeOperation,
  extraFeedback,
}: Props) {
  const solveTime = operation.solveTime();
  const hint = operation.hint();

  const [answer, setAnswer] = useState("");
  const [pressedKey, setPressedKey] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(solveTime);
  const answerRef = useRef("");
  const keystrokesRef = useRef<Keystroke[]>([]);
  const hasErasedRef = useRef(false);

  // Reset state on each new trial
  useEffect(() => {
    setAnswer("");
    answerRef.current = "";
    setPressedKey(null);
    setRemaining(solveTime);
    keystrokesRef.current = [];
    hasErasedRef.current = false;
  }, [trialId, solveTime]);

  // Countdown timer — only active while answering
  const startedAt = playingState.type === "answering" ? playingState.startedAt : null;

  useEffect(() => {
    if (startedAt === null) return;
    const id = setInterval(() => {
      const left = Math.max(0, solveTime - (Date.now() - startedAt));
      setRemaining(left);
      if (left === 0) {
        clearInterval(id);
        onTimeUp(keystrokesRef.current, hasErasedRef.current);
      }
    }, 100);
    return () => clearInterval(id);
  }, [startedAt, solveTime, onTimeUp]);

  // Auto-advance after showing feedback
  useEffect(() => {
    if (playingState.type !== "reviewing") return;
    const id = setTimeout(() => onAdvance(), 1000);
    return () => clearTimeout(id);
  }, [playingState.type, onAdvance]);

  // Keyboard input — only active while answering
  useEffect(() => {
    if (playingState.type !== "answering") return;
    function onKeyDown(e: KeyboardEvent) {
      if (/^\d$/.test(e.key)) {
        press(e.key);
        keystrokesRef.current.push({ key: e.key, t: Date.now() - (startedAt ?? Date.now()) });
        setAnswer((prev) => (prev.length < 10 ? prev + e.key : prev));
        answerRef.current =
          answerRef.current.length < 10
            ? answerRef.current + e.key
            : answerRef.current;
      } else if (e.key === "Backspace") {
        press("⌫");
        keystrokesRef.current.push({ key: "⌫", t: Date.now() - (startedAt ?? Date.now()) });
        hasErasedRef.current = true;
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
  }, [playingState.type, onSubmitAnswer]); // eslint-disable-line react-hooks/exhaustive-deps

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
      keystrokesRef.current.push({ key: "⌫", t: Date.now() - (startedAt ?? Date.now()) });
      hasErasedRef.current = true;
      setAnswer((prev) => prev.slice(0, -1));
      answerRef.current = answerRef.current.slice(0, -1);
    } else {
      keystrokesRef.current.push({ key, t: Date.now() - (startedAt ?? Date.now()) });
      setAnswer((prev) => (prev.length < 10 ? prev + key : prev));
      answerRef.current =
        answerRef.current.length < 10
          ? answerRef.current + key
          : answerRef.current;
    }
  }

  function doSubmit() {
    const parsed = parseInt(answerRef.current, 10);
    if (answerRef.current !== "" && !isNaN(parsed))
      onSubmitAnswer(parsed, keystrokesRef.current, hasErasedRef.current);
  }

  const isReviewing = playingState.type === "reviewing";
  const result = isReviewing ? playingState.result : null;

  const ratio = remaining / solveTime;
  const timerColor =
    ratio > 0.5 ? "#4ade80" : ratio > 0.25 ? "#facc15" : "#f87171";
  const seconds = Math.ceil(remaining / 1000);

  return (
    <div className="bg-[#1a1a24] border border-[#2e2e42] rounded-2xl p-6 w-full max-w-[380px] flex flex-col gap-5">
      {/* Header */}
      <div className="flex justify-between items-center text-sm text-[#a0a0c0]">
        {headerLeft}
        <span className={`transition-opacity duration-300 ${isReviewing ? "opacity-0" : "opacity-100"}`}>
          {seconds}s
        </span>
        {headerRight}
      </div>

      {/* Timer bar */}
      <div className={`h-1.5 bg-[#2e2e42] rounded-full overflow-hidden transition-opacity duration-300 ${isReviewing ? "opacity-0" : "opacity-100"}`}>
        <div
          className="h-full rounded-full transition-[width] duration-100 ease-linear"
          style={{ width: `${ratio * 100}%`, backgroundColor: timerColor }}
        />
      </div>

      {beforeOperation}

      {/* Operation */}
      <div className="text-5xl font-bold text-center tracking-tight py-1">
        {operation.humanReadable()}
      </div>

      {/* Hint card — shown when hint is requested */}
      {hintVisible && !isReviewing && <HintCard steps={hint.getSteps()} />}

      {/* Calculator section */}
      <div className="relative flex flex-col gap-3">
        <div className="bg-[#0f0f13] border border-[#2e2e42] rounded-xl px-4 py-3 text-right text-3xl font-mono min-h-[3.5rem] flex items-center justify-end select-none">
          {answer || <span className="text-[#3e3e52]">0</span>}
        </div>

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

        <button
          className="cursor-pointer bg-[#5a5af0] text-white w-full rounded-xl py-3 font-semibold text-lg hover:opacity-90 active:scale-[0.97] disabled:opacity-30 disabled:cursor-not-allowed transition-opacity"
          disabled={!answer}
          onPointerDown={doSubmit}
        >
          Submit
        </button>

        {/* Feedback overlay */}
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
            {extraFeedback?.(result)}
          </div>
        )}
      </div>
    </div>
  );
}

export type { Props as AnsweringPanelProps };
