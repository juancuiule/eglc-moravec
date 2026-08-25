type Props = {
  /** Whether each trial played so far was correct, in order. Indices past this array's length are rendered as not-yet-played. */
  outcomes: boolean[];
  total: number;
};

/** A row of `total` dots — green once a trial is correct, pink once it's wrong, gray while still unplayed. */
export function TrialHistoryDots({ outcomes, total }: Props) {
  return (
    <div className="flex items-center justify-center gap-1" aria-hidden="true">
      {Array.from({ length: total }, (_, i) => {
        const outcome = outcomes[i];
        const color = outcome === undefined ? "bg-subtle" : outcome ? "bg-success" : "bg-accent";
        return <span key={i} className={`w-1.5 h-1.5 rounded-full shrink-0 ${color}`} />;
      })}
    </div>
  );
}
