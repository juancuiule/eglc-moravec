import { expect, test } from "vitest";
import {
  categoriesForTopic,
  isTutorialTopic,
  videoIdFor,
  TUTORIAL_TOPICS,
  TUTORIAL_EXAMPLES,
  MAJOR_SYSTEM_TABLE,
} from "./content";

test("categoriesForTopic maps each topic to its engine category codename(s)", () => {
  expect(categoriesForTopic("addition")).toEqual(["1d+1d", "2d+2d"]);
  expect(categoriesForTopic("multiplication")).toEqual(["1dx1d", "2dx1d", "3dx1d", "4dx1d"]);
  expect(categoriesForTopic("squaring2d")).toEqual(["(2d)^2"]);
  expect(categoriesForTopic("squaring3d")).toEqual(["(3d)^2"]);
  expect(categoriesForTopic("squaring4d")).toEqual(["(4d)^2"]);
});

test("categoriesForTopic returns no categories for Major System — it isn't an implemented operation", () => {
  expect(categoriesForTopic("majorSystem")).toEqual([]);
});

test("isTutorialTopic accepts exactly the known topics", () => {
  for (const topic of TUTORIAL_TOPICS) {
    expect(isTutorialTopic(topic)).toBe(true);
  }
  expect(isTutorialTopic("squaring")).toBe(false);
  expect(isTutorialTopic("division")).toBe(false);
  expect(isTutorialTopic("")).toBe(false);
});

test("videoIdFor returns the real per-topic video id", () => {
  expect(videoIdFor("addition")).toBe("Ies8X7VxGKs");
  expect(videoIdFor("multiplication")).toBe("mwa-zblNdR4");
  expect(videoIdFor("squaring2d")).toBe("_CUWlWjFreM");
  expect(videoIdFor("squaring3d")).toBe("VHsTlMzN76g");
  expect(videoIdFor("squaring4d")).toBe("WW_VLPJ__V0");
  expect(videoIdFor("majorSystem")).toBe("Fv0Si7UJHKw");
});

test("every topic has at least one worked example", () => {
  for (const topic of TUTORIAL_TOPICS) {
    expect(TUTORIAL_EXAMPLES[topic].length).toBeGreaterThan(0);
  }
});

test("the Major System table covers all ten digits", () => {
  expect(MAJOR_SYSTEM_TABLE.map((row) => row.digit)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
});
