import { Api } from "@/api/Api";
import { LevelsList } from "@/components/LevelsList";

export default async function LevelsPage() {
  // Records and unlock state live in the local-first store — the page only
  // needs the catalog.
  const levelKeys = await Api.fetchLevelNumbers();

  return <LevelsList levelKeys={levelKeys} />;
}
