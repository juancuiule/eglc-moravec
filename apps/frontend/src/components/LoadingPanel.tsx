import { panel } from "@/styles";

type Props = { label: string };

export function LoadingPanel({ label }: Props) {
  return (
    <div className={`${panel} p-6 items-center justify-center min-h-60`}>
      <p className="text-sm text-muted">{label}</p>
    </div>
  );
}
