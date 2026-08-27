import { panel } from "@/styles";

export default function Loading() {
  return (
    <div className={`${panel} p-6 items-center justify-center min-h-[240px]`}>
      <p className="text-sm text-muted">Loading level…</p>
    </div>
  );
}
