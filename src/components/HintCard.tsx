type Props = { steps: string[] };

export function HintCard({ steps }: Props) {
  return (
    <div className="animate-fade-in bg-[#1a1a38] border border-[#5a5af0]/40 rounded-xl px-4 py-3 flex flex-col gap-1">
      {steps.map((step, i) => (
        <span
          key={i}
          className="font-mono text-sm text-[#c0c0f0] leading-snug"
        >
          {step}
        </span>
      ))}
    </div>
  );
}
