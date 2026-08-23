type Props = { steps: string[] };

export function HintCard({ steps }: Props) {
  return (
    <div className="animate-fade-in bg-panel-accent border border-accent/40 rounded-xl px-4 py-3 flex flex-col gap-1">
      {steps.map((step, i) => (
        <span
          key={i}
          className="font-mono text-sm text-accent-soft leading-snug"
        >
          {step}
        </span>
      ))}
    </div>
  );
}
