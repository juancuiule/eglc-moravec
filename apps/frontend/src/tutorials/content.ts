import { categoryFromCodename, type OperationCategory } from "engine";
import { ALL_CATEGORIES } from "../stats/computeStats";

export type TutorialTopic = OperationCategory["type"];

export const TUTORIAL_TOPICS: TutorialTopic[] = ["addition", "multiplication", "squaring"];

export const TUTORIAL_TITLES: Record<TutorialTopic, string> = {
  addition: "Addition",
  multiplication: "Multiplication",
  squaring: "Squaring",
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
};

export function isTutorialTopic(value: string): value is TutorialTopic {
  return (TUTORIAL_TOPICS as string[]).includes(value);
}

/** All known category codenames belonging to one tutorial topic, in ALL_CATEGORIES order. */
export function categoriesForTopic(topic: TutorialTopic): string[] {
  return ALL_CATEGORIES.filter((codename) => categoryFromCodename(codename).type === topic);
}
