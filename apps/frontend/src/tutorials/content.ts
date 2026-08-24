import { categoryFromCodename, type OperationCategory } from "engine";
import { ALL_CATEGORIES } from "../stats/computeStats";

// "majorSystem" has no OperationCategory counterpart — it's a memory
// mnemonic, not an arithmetic operation the engine implements.
export type TutorialTopic = OperationCategory["type"] | "majorSystem";

export const TUTORIAL_TOPICS: TutorialTopic[] = [
  "addition",
  "multiplication",
  "squaring",
  "majorSystem",
];

export const TUTORIAL_TITLES: Record<TutorialTopic, string> = {
  addition: "Addition",
  multiplication: "Multiplication",
  squaring: "Squaring",
  majorSystem: "Major System",
};

// Plain-language explanation of the technique — for multiplication and
// squaring this is a description of the exact decomposition the in-game
// Hint reveals (see engine's MultiplicationHint/SquaringHint). Addition has
// no Hint at all (Operation's default NoHint), which is itself worth saying.
export const TUTORIAL_EXPLANATIONS: Record<TutorialTopic, string> = {
  addition:
    "There's no decomposition trick for addition — the in-game Hint button won't do anything here. Line up the digits by place value in your head and add right to left, carrying when a column passes 9. Speed here comes from practice, not a shortcut.",
  multiplication:
    "Break the larger operand into place-value chunks, multiply the smaller operand by each chunk, then add the results. This is exactly the Hint you'll see in-game if you get stuck.",
  squaring:
    "Round the number to the nearest multiple of ten, then use x² = (x−a)(x+a) + a² — multiplying two round numbers is far easier than squaring the original directly. This is the same Hint shown in-game.",
  majorSystem:
    "The Major System maps each digit to a consonant sound, so any string of numbers becomes consonants you can fill with vowels into a memorable word. It's a general memory technique, not something any Trial in this app tests — no Practice category here, just the idea.",
};

export function isTutorialTopic(value: string): value is TutorialTopic {
  return (TUTORIAL_TOPICS as string[]).includes(value);
}

/** All known category codenames belonging to one tutorial topic, in ALL_CATEGORIES order. Empty for topics (like Major System) with no matching Operation type. */
export function categoriesForTopic(topic: TutorialTopic): string[] {
  return ALL_CATEGORIES.filter((codename) => categoryFromCodename(codename).type === topic);
}

// Real tutorial videos from the original Moravec app's YouTube channel
// (github.com's archived moravec-native, verified still public). Addition
// and Multiplication use one video regardless of digit count; Squaring has
// a separate video per digit count, keyed by category codename.
const TUTORIAL_VIDEO_BY_TOPIC: Partial<Record<TutorialTopic, string>> = {
  addition: "Ies8X7VxGKs",
  multiplication: "mwa-zblNdR4",
  majorSystem: "Fv0Si7UJHKw",
};

const SQUARING_VIDEO_BY_CATEGORY: Record<string, string> = {
  "(2d)^2": "_CUWlWjFreM",
  "(3d)^2": "VHsTlMzN76g",
  "(4d)^2": "WW_VLPJ__V0",
};

/** The YouTube video id for a topic, given the currently selected category (only Squaring's video depends on it). */
export function videoIdFor(topic: TutorialTopic, codename?: string): string | null {
  if (topic === "squaring") {
    return (codename && SQUARING_VIDEO_BY_CATEGORY[codename]) ?? null;
  }
  return TUTORIAL_VIDEO_BY_TOPIC[topic] ?? null;
}
