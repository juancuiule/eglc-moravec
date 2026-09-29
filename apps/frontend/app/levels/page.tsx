import { Api } from "@/api/Api";
import { fetchStatsSeed } from "@/api/statsSeed";
import { LevelsList } from "@/components/LevelsList";
import { LocalLevelsList } from "@/components/LocalLevelsList";

export default async function LevelsPage() {
  // Records and unlock state are derived from the local-first store — the
  // page only needs the catalog plus an optional server stats seed for
  // first paint (and so the menu isn't stuck locked when the boot trial
  // pull fails). The seed is session-scoped: a logout drops it.
  const [levelKeys, stats] = await Promise.all([
    Api.fetchLevelNumbers().catch(() => null),
    fetchStatsSeed(),
  ]);

  // Backend unreachable — the menu renders from the local catalog snapshot
  // instead of the error boundary.
  if (levelKeys === null) return <LocalLevelsList />;

  return <LevelsList levelKeys={levelKeys} stats={stats} />;
}
