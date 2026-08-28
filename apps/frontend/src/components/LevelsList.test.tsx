import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { LevelsList } from "./LevelsList";
import type { LevelStats } from "@/api/Api";

test("level 1 is unlocked and links to play; level 2 is locked (level 1 has no stars), not a link", async () => {
  render(<LevelsList stats={{}} levelKeys={[1, 2, 3]} />);

  const level1 = await screen.findByRole("link", { name: /Level 1/ });
  expect(level1.getAttribute("href")).toBe("/level/1");

  const level2Row = screen.getByText("Level 2").closest("a, div");
  expect(level2Row?.tagName).toBe("DIV");
  expect(screen.getByText("Level 2").closest("a")).toBeNull();
});

test("level 2 unlocks once level 1 has at least one star", async () => {
  const stats: Record<string, LevelStats> = {
    "1": { stars: 1, totalTime: 9000, completedAt: new Date().toISOString() },
  };

  render(<LevelsList stats={stats} levelKeys={[1, 2, 3]} />);

  const level2 = await screen.findByRole("link", { name: /Level 2/ });
  expect(level2.getAttribute("href")).toBe("/level/2");
});
