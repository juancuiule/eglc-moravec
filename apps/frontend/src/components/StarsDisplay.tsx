"use client";

import { Star } from "lucide-react";
import { useTranslations } from "next-intl";

type Props = { stars: 0 | 1 | 2 | 3 };

export function StarsDisplay({ stars }: Props) {
  const t = useTranslations("Levels");
  return (
    <div
      role="img"
      aria-label={t("stars", { count: stars })}
      className="flex justify-center gap-2"
    >
      {[1, 2, 3].map((n) => (
        <Star
          key={n}
          size={36}
          aria-hidden="true"
          fill="currentColor"
          className={n <= stars ? "text-warning" : "text-disabled"}
        />
      ))}
    </div>
  );
}
