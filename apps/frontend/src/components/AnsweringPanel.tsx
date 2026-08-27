"use client";

import { useState, useEffect, useRef, type ReactNode } from "react";
import type { Operation, Answering, BaseTrialResult, Keystroke } from "engine";
import { HintCard } from "./HintCard";
import { panel } from "../styles";

type ReviewingResult = { type: "reviewing"; result: BaseTrialResult };

type Props = {
  operation: Operation;
  playingState: Answering | ReviewingResult;
  trialId: number;
  hintVisible: boolean;
  onSubmitAnswer: (
    answer: number,
    keystrokes: Keystroke[],
    hasErased: boolean,
  ) => void;
  onTimeUp: (
    answer: number | null,
    keystrokes: Keystroke[],
    hasErased: boolean,
  ) => void;
  onAdvance: () => void;
  /** Left side of the header row (trial count / correct count). */
  headerLeft: ReactNode;
  /** Right side of the header row (hint budget, stop button, …). The countdown sits between the two. */
  headerRight: ReactNode;
  /** Rendered directly above the timer bar (e.g. a per-trial history strip). */
  aboveTimer?: ReactNode;
  /** Rendered between the timer bar and the operation display (e.g. a category label). */
  beforeOperation?: ReactNode;
  /** Extra line rendered inside the feedback overlay, alongside the correct/wrong message. */
  extraFeedback?: (result: BaseTrialResult) => ReactNode;
};

/** Parses the calculator's current raw input, or null if it's empty/unparseable. */
function parsedAnswer(raw: string): number | null {
  const parsed = parseInt(raw, 10);
  return raw !== "" && !isNaN(parsed) ? parsed : null;
}

const ROWS = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  ["C", "0", "⌫"],
];

/** Accessible names for the two symbol/letter action keys — their own glyph isn't a reliable screen-reader name. */
const KEY_LABELS: Record<string, string> = {
  C: "Clear",
  "⌫": "Delete last digit",
};

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
  aboveTimer,
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
  const startedAt =
    playingState.type === "answering" ? playingState.startedAt : null;

  useEffect(() => {
    if (startedAt === null) return;
    const id = setInterval(() => {
      const left = Math.max(0, solveTime - (Date.now() - startedAt));
      setRemaining(left);
      if (left === 0) {
        clearInterval(id);
        onTimeUp(
          parsedAnswer(answerRef.current),
          keystrokesRef.current,
          hasErasedRef.current,
        );
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
        handleButton(e.key);
      } else if (e.key === "Backspace") {
        handleButton("⌫");
      } else if (e.key === "Delete") {
        handleButton("C");
      } else if (e.key === "Enter") {
        doSubmit();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // handleButton/doSubmit close over startedAt, answer, etc., but those are
    // only ever fresh per trial, and playingState.type always toggles through
    // "reviewing" between trials (see game/index.ts, practice/index.ts) — so
    // this effect re-subscribes with a fresh closure every time a new trial's
    // "answering" state begins. Safe to omit them from the deps below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playingState.type, onSubmitAnswer]);

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
      keystrokesRef.current.push({
        key: "⌫",
        t: Date.now() - (startedAt ?? Date.now()),
      });
      hasErasedRef.current = true;
      setAnswer((prev) => prev.slice(0, -1));
      answerRef.current = answerRef.current.slice(0, -1);
    } else {
      keystrokesRef.current.push({
        key,
        t: Date.now() - (startedAt ?? Date.now()),
      });
      setAnswer((prev) => (prev.length < 10 ? prev + key : prev));
      answerRef.current =
        answerRef.current.length < 10
          ? answerRef.current + key
          : answerRef.current;
    }
  }

  function doSubmit() {
    const parsed = parsedAnswer(answerRef.current);
    if (parsed !== null)
      onSubmitAnswer(parsed, keystrokesRef.current, hasErasedRef.current);
  }

  const isReviewing = playingState.type === "reviewing";
  const result = isReviewing ? playingState.result : null;

  const ratio = remaining / solveTime;
  // Referencing the theme's own CSS variables (Tailwind v4 emits one per
  // @theme color) instead of repeating their hex values here in JS.
  const timerColor =
    ratio > 0.5
      ? "var(--color-success)"
      : ratio > 0.25
        ? "var(--color-warning)"
        : "var(--color-danger)";
  const seconds = Math.ceil(remaining / 1000);

  return (
    <div className={`${panel} p-6 gap-5`}>
      {/* Header */}
      <div className="flex justify-between items-center text-sm text-muted">
        <div className="flex flex-1 justify-start">{headerLeft}</div>
        <span
          className={`transition-opacity font-mono duration-300 ${isReviewing ? "opacity-0" : "opacity-100"}`}
        >
          {seconds}s
        </span>
        <div className="flex flex-1 justify-end">{headerRight}</div>
      </div>

      {/* {aboveTimer} */}

      {/* Timer bar */}
      <div
        className={`h-1.5 bg-subtle rounded-full overflow-hidden transition-opacity duration-300 ${isReviewing ? "opacity-0" : "opacity-100"}`}
      >
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
        <div className="bg-base border border-subtle rounded-xl px-4 py-3 text-right text-3xl font-mono flex items-center justify-end select-none">
          {answer || <span className="text-disabled">0</span>}
        </div>

        <div className="grid grid-cols-3 gap-2">
          {ROWS.flat().map((key) => {
            const isAction = key === "C" || key === "⌫";
            const isPressed = pressedKey === key;
            return (
              <button
                key={key}
                onPointerDown={() => press(key)}
                onClick={() => handleButton(key)}
                aria-label={KEY_LABELS[key]}
                className={[
                  "h-14 rounded-xl font-semibold text-xl cursor-pointer select-none",
                  "transition-all duration-100",
                  isAction
                    ? "bg-subtle text-muted hover:bg-subtle-accent"
                    : "bg-base border border-subtle text-foreground hover:border-accent hover:text-accent",
                  isPressed ? "scale-96 brightness-150" : "",
                ].join(" ")}
              >
                {key}
              </button>
            );
          })}
        </div>

        <button
          className="cursor-pointer bg-teal text-white w-full rounded-xl py-3 font-semibold text-lg hover:opacity-90 active:scale-96 disabled:opacity-30 disabled:cursor-not-allowed transition-[opacity,scale] duration-150"
          disabled={!answer}
          onClick={doSubmit}
        >
          Submit
        </button>

        {/* Feedback overlay */}
        {isReviewing && result && (
          <div
            className={[
              "absolute inset-0 rounded-xl flex flex-col items-center justify-center gap-1 font-semibold",
              result.correct
                ? "bg-success-bg/95 text-success border border-success-solid"
                : "bg-danger-bg/95 text-danger border border-danger-border",
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
