import { expect, test } from "vitest";
import { categoriesForTopic, isTutorialTopic } from "./content";

test("categoriesForTopic groups codenames by operation type", () => {
  expect(categoriesForTopic("addition")).toEqual(["1d+1d", "2d+2d"]);
  expect(categoriesForTopic("multiplication")).toEqual(["1dx1d", "2dx1d", "3dx1d", "4dx1d"]);
  expect(categoriesForTopic("squaring")).toEqual(["(2d)^2", "(3d)^2", "(4d)^2"]);
});

test("isTutorialTopic accepts only the three known topics", () => {
  expect(isTutorialTopic("addition")).toBe(true);
  expect(isTutorialTopic("multiplication")).toBe(true);
  expect(isTutorialTopic("squaring")).toBe(true);
  expect(isTutorialTopic("division")).toBe(false);
  expect(isTutorialTopic("")).toBe(false);
});
