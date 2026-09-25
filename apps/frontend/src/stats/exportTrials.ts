import type { SyncedTrial } from "../api/Api";

// Personal data export (#70): the already-fetched SyncedTrial rows serialized
// client-side — the self-hosted/no-lock-in ethos, and transparency for the
// research contribution.

const COLUMNS = [
  "id",
  "played_at",
  "level_number",
  "run_type",
  "run_id",
  "category_codename",
  "operands",
  "answer",
  "correct",
  "time_exceeded",
  "time_taken_ms",
  "hint_shown",
] as const;

function csvCell(value: string | number | boolean | null): string {
  const s = value === null ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function rowOf(t: SyncedTrial): string {
  return [
    t.id,
    new Date(t.playedAt).toISOString(),
    t.levelNumber,
    t.runType,
    t.runId,
    t.categoryCodename,
    JSON.stringify(t.operands),
    t.answer,
    t.correct,
    t.timeExceeded,
    t.timeTaken,
    t.hintShown,
  ]
    .map(csvCell)
    .join(",");
}

export function trialsToCsv(trials: SyncedTrial[]): string {
  return [COLUMNS.join(","), ...trials.map(rowOf)].join("\n") + "\n";
}

export function trialsToJson(trials: SyncedTrial[]): string {
  return JSON.stringify(trials, null, 2) + "\n";
}

export function exportFilename(ext: "csv" | "json", now = new Date()): string {
  const date = now.toISOString().slice(0, 10);
  return `moravec-trials-${date}.${ext}`;
}

/** The DOM half of the export — kept out of the serializers so they stay
 *  pure/testable. */
export function downloadTextFile(
  filename: string,
  content: string,
  mime: string,
): void {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
