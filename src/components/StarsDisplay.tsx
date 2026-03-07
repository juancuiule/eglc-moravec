type Props = { stars: 0 | 1 | 2 | 3 };

export function StarsDisplay({ stars }: Props) {
  return (
    <div className="flex justify-center gap-2 text-4xl">
      {[1, 2, 3].map((n) => (
        <span
          key={n}
          className={n <= stars ? "text-[#facc15]" : "text-[#3e3e52]"}
        >
          ★
        </span>
      ))}
    </div>
  );
}
