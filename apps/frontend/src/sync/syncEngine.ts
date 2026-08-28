import { currentStreak } from "engine";
import type { Row } from "tinybase";
import { Api, type SyncTrialInput, type SyncTrialOutput, type SyncLevelRunOutput } from "../api/Api";
import type { AuthState } from "../auth/store";
import { localStore } from "../storage/store";

const CURSOR_KEY = "cursor";
const MIN_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30_000;
const JITTER_FACTOR = 0.2;

let backoffMs = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

function getCursor(): number {
  return (localStore.getValue(CURSOR_KEY) as number | undefined) ?? 0;
}

type RunOrderEntry = { id: string; playedAt: string; correct: boolean };

/** Every trial sharing a runId, oldest first — the ordering `reconstructPracticeStreak` needs. */
function groupByRunIdInOrder(entries: [string, Row][]): Map<string, RunOrderEntry[]> {
  const byRunId = new Map<string, RunOrderEntry[]>();
  entries.forEach(([id, row]) => {
    const runId = row.runId as string;
    const list = byRunId.get(runId) ?? [];
    list.push({ id, playedAt: row.playedAt as string, correct: row.correct as boolean });
    byRunId.set(runId, list);
  });
  byRunId.forEach((list) => list.sort((a, b) => a.playedAt.localeCompare(b.playedAt)));
  return byRunId;
}

/**
 * A Practice trial doesn't carry a stored `streakAtSubmit` (see storage/
 * practiceHistory.ts) — unlike a Level trial, whose live gameplay already
 * computed and stored it. Reconstructed here from the other trials in the
 * same run, the same way the deleted pushPracticeResults.ts used to compute
 * it from the live in-memory results array, since that array no longer
 * exists by the time an offline trial finally gets synced.
 *
 * Excludes the trial's own outcome: `streakAtSubmit` means the streak going
 * INTO this submission, not including it — matching game/index.ts's
 * `currentStreak(state.results)` (computed before the current trial is
 * appended) and the deleted pushPracticeResults.ts's
 * `currentStreak(results.slice(0, i))`.
 */
function reconstructPracticeStreak(runOrder: RunOrderEntry[], id: string): number {
  const indexInRun = runOrder.findIndex((r) => r.id === id);
  return currentStreak(runOrder.slice(0, indexInRun));
}

/** Builds this device's pending push payload from the local `trials` table. */
function buildPendingTrials(): SyncTrialInput[] {
  const table = localStore.getTable("trials");
  const entries = Object.entries(table);
  const byRunId = groupByRunIdInOrder(entries);

  return entries
    .filter(([, row]) => row.synced === false)
    .map(([id, row]) => {
      const runType = row.runType as "level" | "practice";
      const isPractice = runType === "practice";

      return {
        id,
        runType,
        levelNumber: isPractice ? null : (row.levelNumber as number),
        categoryCodename: row.categoryCodename as string,
        correct: row.correct as boolean,
        timeExceeded: row.timeExceeded as boolean,
        timeTaken: row.timeTaken as number,
        playedAt: new Date(row.playedAt as string).getTime(),
        keystrokes: JSON.parse(row.keystrokes as string),
        operands: JSON.parse(row.operands as string),
        answer: "answer" in row ? (row.answer as number) : null,
        hintShown: row.hintShown as boolean,
        streakAtSubmit: isPractice
          ? reconstructPracticeStreak(byRunId.get(row.runId as string) ?? [], id)
          : (row.streakAtSubmit as number),
        hintsAvailableAtStart: isPractice ? 0 : (row.hintsAvailableAtStart as number),
        runId: row.runId as string,
      };
    });
}

/**
 * A pulled trial carries no keystrokes/operands/answer (the backend's
 * response omits them — nothing local reads them for a trial this device
 * didn't record itself), so they're stored empty. levelNumber is omitted
 * for Practice, matching how a local write already represents "none".
 */
function applyPulledTrial(t: SyncTrialOutput): void {
  localStore.setRow("trials", t.id, {
    id: t.id,
    runType: t.runType,
    ...(t.levelNumber !== null ? { levelNumber: t.levelNumber } : {}),
    categoryCodename: t.categoryCodename,
    correct: t.correct,
    timeExceeded: t.timeExceeded,
    timeTaken: t.timeTaken,
    playedAt: new Date(t.playedAt).toISOString(),
    keystrokes: "[]",
    operands: "[]",
    hintShown: t.hintShown,
    streakAtSubmit: t.streakAtSubmit,
    hintsAvailableAtStart: t.hintsAvailableAtStart,
    runId: t.runId,
    synced: true,
  });
}

/**
 * Always overwrites, even over a local row under the same id — see the
 * design doc's "Local store" / "Sync engine" sections for why a level run
 * doesn't need the same "don't override" treatment trial correctness gets:
 * totalTime is an unvalidated client-reported sum that can't actually
 * disagree, and stars/levelCompleted only disagree on a bug or a tampered
 * client — exactly the case a correction should be visible for.
 */
function applyPulledLevelRun(r: SyncLevelRunOutput): void {
  localStore.setRow("levelRuns", r.id, {
    id: r.id,
    levelNumber: r.levelNumber,
    stars: r.stars,
    totalTime: r.totalTime,
    levelCompleted: r.levelCompleted,
    playedAt: new Date(r.playedAt).toISOString(),
    synced: true,
  });
}

function scheduleRetry(authState: AuthState): void {
  backoffMs = backoffMs === 0 ? MIN_BACKOFF_MS : Math.min(backoffMs * 2, MAX_BACKOFF_MS);
  const jitter = backoffMs * JITTER_FACTOR * Math.random();
  retryTimer = setTimeout(() => {
    void attemptSync(authState);
  }, backoffMs + jitter);
}

async function attemptSync(authState: AuthState): Promise<void> {
  if (authState.type === "loggedOut") return;

  const trials = buildPendingTrials();
  const cursor = getCursor();

  try {
    const response = await Api.sync(authState.token, { cursor, trials });

    trials.forEach((t) => localStore.setCell("trials", t.id, "synced", true));
    response.trials.forEach(applyPulledTrial);
    response.levelRuns.forEach(applyPulledLevelRun);
    localStore.setValue(CURSOR_KEY, response.cursor);

    backoffMs = 0;
  } catch {
    scheduleRetry(authState);
  }
}

/**
 * Pushes every pending trial and pulls anything new since this device's
 * cursor, in one round trip. A fresh call — from a Level finishing, a
 * Practice session stopping, an `online` event, app boot, or a login —
 * always cancels any pending backoff retry and starts over immediately,
 * so a new reason to sync never waits out a stale delay. Retries on
 * failure happen on their own via `attemptSync`'s internal reschedule,
 * not by calling this function again.
 */
export function sync(authState: AuthState): Promise<void> {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  backoffMs = 0;
  return attemptSync(authState);
}
