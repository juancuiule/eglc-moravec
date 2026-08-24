import { expect, test } from "vitest";
import { categoriesForTopic, isTutorialTopic, videoIdFor } from "./content";

test("categoriesForTopic groups codenames by operation type", () => {
  expect(categoriesForTopic("addition")).toEqual(["1d+1d", "2d+2d"]);
  expect(categoriesForTopic("multiplication")).toEqual(["1dx1d", "2dx1d", "3dx1d", "4dx1d"]);
  expect(categoriesForTopic("squaring")).toEqual(["(2d)^2", "(3d)^2", "(4d)^2"]);
});

test("categoriesForTopic returns no categories for Major System — it isn't an implemented operation", () => {
  expect(categoriesForTopic("majorSystem")).toEqual([]);
});

test("isTutorialTopic accepts only the four known topics", () => {
  expect(isTutorialTopic("addition")).toBe(true);
  expect(isTutorialTopic("multiplication")).toBe(true);
  expect(isTutorialTopic("squaring")).toBe(true);
  expect(isTutorialTopic("majorSystem")).toBe(true);
  expect(isTutorialTopic("division")).toBe(false);
  expect(isTutorialTopic("")).toBe(false);
});

test("videoIdFor returns one video per topic, except Squaring which varies by category", () => {
  expect(videoIdFor("addition")).toBe("Ies8X7VxGKs");
  expect(videoIdFor("multiplication")).toBe("mwa-zblNdR4");
  expect(videoIdFor("majorSystem")).toBe("Fv0Si7UJHKw");

  expect(videoIdFor("squaring", "(2d)^2")).toBe("_CUWlWjFreM");
  expect(videoIdFor("squaring", "(3d)^2")).toBe("VHsTlMzN76g");
  expect(videoIdFor("squaring", "(4d)^2")).toBe("WW_VLPJ__V0");
  expect(videoIdFor("squaring")).toBeNull();
});
