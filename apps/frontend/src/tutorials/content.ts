// "majorSystem" has no OperationCategory counterpart — it's a memory
// mnemonic, not an arithmetic operation the engine implements. Squaring is
// split into one topic per digit count (rather than one "squaring" topic
// with a selector) to match the original app's tutorial menu, since the
// technique for 3- and 4-digit squares is genuinely a different, deeper
// lesson than for 2-digit squares.
export type TutorialTopic =
  | "addition"
  | "multiplication"
  | "squaring2d"
  | "squaring3d"
  | "squaring4d"
  | "majorSystem";

// Order matters: Major System comes before 4-digit squaring because that
// squaring tutorial leans on it (see squaring4d's explanation below) —
// the original app's menu ordering, not alphabetical or by difficulty.
export const TUTORIAL_TOPICS: TutorialTopic[] = [
  "addition",
  "multiplication",
  "squaring2d",
  "squaring3d",
  "majorSystem",
  "squaring4d",
];

// Titles, subtitles, explanations, per-example notes, and the "live
// example" note all moved to messages/{locale}/tutorials.json (see
// TutorialsList/TutorialDetail) — they're translatable prose, not data.
// What's left here is locale-invariant: ids, arithmetic notation, and the
// Major System's Spanish-phonetic table (kept identical in both locales —
// see tutorials.json's majorSystem explanation for why).

export type WorkedExample = {
  /** Each line of the derivation, first line is the problem itself. */
  steps: string[];
};

export const TUTORIAL_EXAMPLES: Record<TutorialTopic, WorkedExample[]> = {
  addition: [
    { steps: ["56 + 21", "= (56 + 20) + 1", "= 76 + 1", "= 77"] },
    { steps: ["44 + 38", "= (44 + 30) + 8", "= 74 + 8", "= 82"] },
  ],
  multiplication: [
    { steps: ["27 × 4", "= (20×4) + (7×4)", "= 80 + 28", "= 108"] },
    { steps: ["48 × 9", "= (40×9) + (8×9)", "= 360 + 72", "= 432"] },
  ],
  squaring2d: [
    { steps: ["47² = (47+3)(47−3) + 3²", "= 50 × 44 + 9", "= 2209"] },
    { steps: ["83² = (83−3)(83+3) + 3²", "= 80 × 86 + 9", "= 6889"] },
  ],
  squaring3d: [
    {
      steps: [
        "512² = (512+12)(512−12) + 12²",
        "= 524 × 500 + 12²",
        "12² = (12+2)(12−2) + 2² = 14×10 + 4 = 144",
        "= 262,000 + 144 = 262,144",
      ],
    },
    {
      steps: [
        "684² = (684+16)(684−16) + 16²",
        "= 700 × 668 + 16²",
        "16² = (16+4)(16−4) + 4² = 20×12 + 16 = 256",
        "= 467,600 + 256 = 467,856",
      ],
    },
  ],
  squaring4d: [
    {
      // The bracketed word is a Spanish Major System mnemonic by design
      // (see tutorials.json's majorSystem explanation) — kept identical
      // in both locales, not translated.
      steps: [
        "6382² = (6382+382)(6382−382) + 382²",
        "= 6764 × 6000 + 382²",
        '6764 × 6000 = 40,584,000 — hold onto "584" as a word (5=L, 8=G, 4=C → "lógica")',
        "382² = (382−2)(382+2) + 2² = 380 × 384 + 4 = 145,924",
        "40,584,000 + 145,924 = 40,729,924",
      ],
    },
  ],
  majorSystem: [{ steps: ['"lupa" → L, P → 5, 9 → 59'] }],
};

/** The Major System's digit-to-consonant table — the only topic that needs one. */
export const MAJOR_SYSTEM_TABLE: { digit: number; letters: string }[] = [
  { digit: 0, letters: "R, RR" },
  { digit: 1, letters: "T, D" },
  { digit: 2, letters: "N, Ñ" },
  { digit: 3, letters: "M" },
  { digit: 4, letters: "C, K" },
  { digit: 5, letters: "L, LL" },
  { digit: 6, letters: "S, Z" },
  { digit: 7, letters: "F, J" },
  { digit: 8, letters: "G, CH" },
  { digit: 9, letters: "P, B, V" },
];

/** Shown above the live interactive example, only where it teaches a simpler shortcut than the curated walkthrough above it. */
export const TUTORIAL_LIVE_NOTE: Partial<Record<TutorialTopic, string>> = {
  squaring3d:
    "The live example below shows a simpler one-step version — round to the nearest ten instead of a hundred — which works for any digit count but produces less round factors than the full technique above.",
  squaring4d:
    "The live example below shows a simpler one-step version — round to the nearest ten instead of a thousand — which works for any digit count but skips the Major System step.",
};

export function isTutorialTopic(value: string): value is TutorialTopic {
  return (TUTORIAL_TOPICS as string[]).includes(value);
}

const TOPIC_CATEGORIES: Record<TutorialTopic, string[]> = {
  addition: ["1d+1d", "2d+2d"],
  multiplication: ["1dx1d", "2dx1d", "3dx1d", "4dx1d"],
  squaring2d: ["(2d)^2"],
  squaring3d: ["(3d)^2"],
  squaring4d: ["(4d)^2"],
  majorSystem: [],
};

/** The engine category codename(s) this topic has a live example / Practice category for. Empty for Major System — it isn't an implemented operation. */
export function categoriesForTopic(topic: TutorialTopic): string[] {
  return TOPIC_CATEGORIES[topic];
}

// Real tutorial videos from the original Moravec app's YouTube channel
// (archived moravec-native, verified still public).
const TUTORIAL_VIDEO: Record<TutorialTopic, string> = {
  addition: "Ies8X7VxGKs",
  multiplication: "mwa-zblNdR4",
  squaring2d: "_CUWlWjFreM",
  squaring3d: "VHsTlMzN76g",
  squaring4d: "WW_VLPJ__V0",
  majorSystem: "Fv0Si7UJHKw",
};

export function videoIdFor(topic: TutorialTopic): string {
  return TUTORIAL_VIDEO[topic];
}
