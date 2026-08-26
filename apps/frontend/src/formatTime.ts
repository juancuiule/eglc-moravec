/** "00:55:503" — minutes:seconds:milliseconds, for a level's best recorded time. */
export function formatDuration(ms: number): string {
  const totalMs = Math.max(0, Math.round(ms));
  const minutes = Math.floor(totalMs / 60_000);
  const seconds = Math.floor((totalMs % 60_000) / 1000);
  const millis = totalMs % 1000;
  const pad = (n: number, len: number) => String(n).padStart(len, "0");
  return `${pad(minutes, 2)}:${pad(seconds, 2)}:${pad(millis, 3)}`;
}
