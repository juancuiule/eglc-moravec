"use client";

import { useQuery } from "@tanstack/react-query";
import { notFound } from "next/navigation";
import { fetchLevelWithFallback } from "@/storage/levelCache";
import { textLink } from "@/styles";
import { LevelPlay } from "./LevelPlay";

type Props = { levelNumber: number };

/**
 * Fetches the Level being played, client-side — necessary (not just a
 * style choice) so `fetchLevelWithFallback`'s cache fallback can actually
 * run: a Server Component has no access to the IndexedDB-backed local
 * store. `null` from a resolved fetch means a genuine 404 (see
 * `fetchLevelWithFallback`); any other failure, with nothing cached
 * either, surfaces as this query's own error state instead.
 */
export function LevelPageClient({ levelNumber }: Props) {
  const {
    data: mix,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["level", levelNumber],
    queryFn: () => fetchLevelWithFallback(levelNumber),
  });

  if (isLoading) {
    return <p className="text-center text-sm text-muted py-8">Loading level…</p>;
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-2 py-8">
        <p className="text-center text-sm text-danger">Couldn't load this level.</p>
        <button onClick={() => refetch()} className={`${textLink} underline`}>
          Try again
        </button>
      </div>
    );
  }

  if (mix === null || mix === undefined) {
    notFound();
    return null;
  }

  return <LevelPlay levelNumber={levelNumber} level={mix} />;
}
