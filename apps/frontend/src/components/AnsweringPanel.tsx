"use client";

import {
  MAX_KEYSTROKES_PER_TRIAL,
  type Answering,
  type Keystroke,
  type Operation,
} from "engine";
import type { Reviewing } from "../trialSession";
import { Delete } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { panel } from "../styles";
import { HintCard } from "./HintCard";

type Props = {
  operation: Operation;
  playingState: Answering | Reviewing;
  hintVisible: boolean;
  onSubmitAnswer: (answer: number, keystrokes?: Keystroke[]) => void;
  onTimeUp: (answer: number | null, keystrokes?: Keystroke[]) => void;
  onAdvance: () => void;
  headerLeft: ReactNode;
  headerRight: ReactNode;
  beforeOperation?: ReactNode;
};

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

export function AnsweringPanel({
  operation,
  playingState,
  hintVisible,
  onSubmitAnswer,
  onTimeUp,
  onAdvance,
  headerLeft,
  headerRight,
  beforeOperation,
}: Props) {
  const t = useTranslations("Common");
  const KEY_LABELS: Record<string, string> = {
    C: t("clear"),
    "⌫": t("deleteLastDigit"),
  };
  const solveTime = operation.solveTime();
  const hint = operation.hint();

  const [answer, setAnswer] = useState("");
  const [pressedKey, setPressedKey] = useState<string | null>(null);
  // The bar's width/color update imperatively at 10Hz — routing every tick
  // through state would re-render the whole keypad all trial long. React
  // state only carries the once-per-second digit.
  const [seconds, setSeconds] = useState(() => Math.ceil(solveTime / 1000));
  const barRef = useRef<HTMLDivElement>(null);
  const answerRef = useRef("");
  // Per-trial keystroke trace (#68): {key, t} pairs for every ACCEPTED
  // input event during the Answering phase — digits that entered the
  // answer, erases that removed one, and the submit press. No-op presses
  // (⌫/C on an empty answer, a leading 0, an eleventh digit) are excluded so the trace
  // always reconstructs the submitted answer — including for
  // `erased_digit`, which a backspace-on-empty would otherwise trip.
  // Ref, not state — each press is fire-and-forget evidence, and routing
  // it through state would re-render the keypad on every keystroke.
  const keysRef = useRef<Keystroke[]>([]);

  // Countdown timer — only active while answering
  const startedAt =
    playingState.type === "answering" ? playingState.startedAt : null;

  // A new Answering phase (fresh startedAt) starts the trace over.
  useEffect(() => {
    keysRef.current = [];
  }, [startedAt]);

  function recordKey(key: string) {
    if (startedAt === null) return;
    // The schema bound is a hard contract — an oversized trace fails
    // TrialResultSchema and enqueue drops the WHOLE trial, not just the
    // evidence. Cap here so a pathological press burst can never cost
    // the player's result; the truncated prefix is still honest evidence.
    if (keysRef.current.length >= MAX_KEYSTROKES_PER_TRIAL) return;
    // Same clock-rollback clamp as Trial.scoreAnswer's timeTaken.
    keysRef.current.push({ key, t: Math.max(0, Date.now() - startedAt) });
  }

  useEffect(() => {
    if (startedAt === null) return;
    const id = setInterval(() => {
      const left = Math.max(0, solveTime - (Date.now() - startedAt));
      const bar = barRef.current;
      if (bar) {
        // Referencing the theme's own CSS variables (Tailwind v4 emits one
        // per @theme color) instead of repeating their hex values here.
        const ratio = left / solveTime;
        bar.style.width = `${ratio * 100}%`;
        bar.style.backgroundColor =
          ratio > 0.5
            ? "var(--color-success)"
            : ratio > 0.25
              ? "var(--color-warning)"
              : "var(--color-danger)";
      }
      setSeconds((prev) => {
        const next = Math.ceil(left / 1000);
        return prev === next ? prev : next;
      });
      if (left === 0) {
        clearInterval(id);
        onTimeUp(parsedAnswer(answerRef.current), keysRef.current);
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
      // Shortcuts (Cmd/Ctrl+C copy, Cmd+R reload, …) belong to the browser.
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const key =
        e.key === "Backspace"
          ? "⌫"
          : e.key === "Delete" || e.key === "c"
            ? "C"
            : e.key;
      // preventDefault on every handled key: a keypad button keeps focus
      // after a tap, and Enter's default on a focused <button> is to click
      // it — submitting AND re-pressing that key into the sent trace.
      if (/^\d$/.test(key) || key === "⌫" || key === "C") {
        e.preventDefault();
        press(key);
        handleButton(key);
      } else if (e.key === "Enter") {
        e.preventDefault();
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

  // The press animation lives at the event edge (onPointerDown / keydown) —
  // not here — so a tap's pointerdown+click pair doesn't fire it twice.
  function handleButton(key: string) {
    // Only EFFECTIVE presses become evidence — a rejected digit or a
    // no-op erase isn't part of the answer's construction.
    if (key === "C") {
      if (answerRef.current === "") return;
      recordKey("C");
      setAnswer("");
      answerRef.current = "";
    } else if (key === "⌫") {
      if (answerRef.current === "") return;
      recordKey("⌫");
      setAnswer((prev) => prev.slice(0, -1));
      answerRef.current = answerRef.current.slice(0, -1);
    } else {
      if (answerRef.current.length >= 10) return;
      // No leading zeros ("0012") — no generated operation's answer is 0.
      if (key === "0" && answerRef.current === "") return;
      recordKey(key);
      setAnswer((prev) => prev + key);
      answerRef.current = answerRef.current + key;
    }
  }

  function doSubmit() {
    // The submit press is evidence too — the same logical key for the
    // on-screen button and physical Enter. Recorded only when it
    // actually submits (an empty answer's Enter is a no-op press).
    const parsed = parsedAnswer(answerRef.current);
    if (parsed !== null) {
      recordKey("⏎");
      onSubmitAnswer(parsed, keysRef.current);
    }
  }

  const isReviewing = playingState.type === "reviewing";
  const result = isReviewing ? playingState.result : null;

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

      {/* Timer bar */}
      <div
        className={`h-1.5 bg-subtle rounded-full overflow-hidden transition-opacity duration-300 ${isReviewing ? "opacity-0" : "opacity-100"}`}
      >
        <div
          ref={barRef}
          className="h-full rounded-full transition-[width] duration-100 ease-linear"
          style={{ width: "100%", backgroundColor: "var(--color-success)" }}
        />
      </div>

      {beforeOperation}

      {/* Operation */}
      <div className="text-5xl font-gotham font-bold text-center tracking-tight py-1">
        {operation.humanReadable()}
      </div>

      {/* Hint card — only when requested AND the operation actually has one.
          NoHint operations (1dx1d is a memorized fact, not a decomposition)
          otherwise rendered an empty accent-bordered card (#79); same
          hasHint() gate TutorialDetail uses. */}
      {hintVisible && !isReviewing && hint.hasHint() && (
        <HintCard steps={hint.getSteps()} />
      )}

      {/* Calculator section */}
      <div className="relative flex flex-col gap-3">
        {/* <output> is a polite live region: screen readers hear each
            accepted digit/erase without the keypad stealing focus. */}
        <output
          aria-live="polite"
          aria-label={t("yourAnswer")}
          className="bg-base border border-subtle rounded-xl px-4 py-3 text-right text-3xl font-mono flex items-center justify-end select-none"
        >
          {answer || <span className="text-disabled">0</span>}
        </output>

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
                  "h-14 rounded-xl font-medium text-xl cursor-pointer select-none touch-manipulation",
                  "transition-all duration-100",
                  isAction
                    ? "bg-subtle text-muted hover:bg-subtle-accent"
                    : "bg-base border border-subtle text-foreground hover:border-accent hover:text-accent",
                  isPressed ? "scale-96 brightness-150" : "",
                ].join(" ")}
              >
                {/* "⌫" stays the key's identity (it's what the keystroke
                    trace records); only its rendering is an icon. */}
                {key === "⌫" ? (
                  <Delete size={22} aria-hidden="true" className="mx-auto" />
                ) : (
                  key
                )}
              </button>
            );
          })}
        </div>

        <button
          className="cursor-pointer touch-manipulation bg-teal text-white w-full rounded-xl py-3 font-medium text-lg hover:opacity-90 active:scale-96 disabled:opacity-30 disabled:cursor-not-allowed transition-[opacity,scale] duration-150"
          disabled={!answer}
          onClick={doSubmit}
        >
          {t("submit")}
        </button>

        {isReviewing && result && (
          <div
            role="status"
            className={[
              "absolute inset-0 rounded-xl flex flex-col items-center justify-center gap-1 font-semibold",
              result.correct
                ? "bg-success-bg text-success border border-success-solid"
                : "bg-danger-bg text-danger border border-danger-border",
            ].join(" ")}
          >
            <span className="text-3xl">
              {result.correct
                ? t("correct")
                : result.answer === null
                  ? t("timeUp")
                  : t("wrong")}
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

export type { Props as AnsweringPanelProps };
