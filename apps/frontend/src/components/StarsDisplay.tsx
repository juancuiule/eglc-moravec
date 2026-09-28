"use client";

import { useTranslations } from "next-intl";

type Props = { stars: 0 | 1 | 2 | 3 };

export function StarsDisplay({ stars }: Props) {
  const t = useTranslations("Levels");
  return (
    <div
      role="img"
      aria-label={t("stars", { count: stars })}
      className="flex justify-center gap-2 text-4xl"
    >
      {[1, 2, 3].map((n) => (
        <span
          key={n}
          aria-hidden="true"
          className={n <= stars ? "text-warning" : "text-disabled"}
        >
          ★
        </span>
      ))}
    </div>
  );
}
