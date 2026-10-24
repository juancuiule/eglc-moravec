import {
  categoryFromCodename,
  isSupportedCategoryCodename,
  type OperationCategory,
} from "../category";
import { AdditionHint } from "./AdditionHint";
import { ComplementAdditionHint } from "./ComplementAdditionHint";
import type { Hint } from "./Hint";
import { MultiplicationHint } from "./MultiplicationHint";
import { NoHint } from "./NoHint";
import { SquaringHint } from "./SquaringHint";

type OperationType = OperationCategory["type"];

type HintVariant = {
  readonly id: string;
  build(operands: readonly number[]): Hint;
};

// Order and membership are part of the assignment contract: changing either
// reassigns players mid-experiment, so a new variant starts a new
// experiment generation rather than joining this one.
export const HINT_VARIANTS = {
  addition: [
    { id: "add-decompose", build: ([l, r]) => new AdditionHint(l, r) },
    {
      id: "add-complement",
      build: ([l, r]) => new ComplementAdditionHint(l, r),
    },
  ],
  multiplication: [
    {
      id: "mult-decompose",
      build: ([l, r]) =>
        l < 10 && r < 10 ? new NoHint() : new MultiplicationHint(l, r),
    },
  ],
  squaring: [{ id: "sq-diff", build: ([x]) => new SquaringHint(x) }],
} as const satisfies Record<OperationType, readonly HintVariant[]>;

export type HintVariantId = (typeof HINT_VARIANTS)[OperationType][number]["id"];

const variantsOf = (type: OperationType): readonly HintVariant[] =>
  HINT_VARIANTS[type];

function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(input)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/**
 * The variant a player gets for every Operation of one type, for good.
 * `seed` must stay on the device: only its hash picks the bucket. Null when
 * the type has a single variant — there is no condition to record.
 */
export function assignHintVariant(
  seed: string,
  type: OperationType,
): HintVariantId | null {
  const variants = variantsOf(type);
  if (variants.length < 2) return null;
  const bucket = fnv1a(`${seed}:${type}:${variants.length}`) % variants.length;
  return variants[bucket].id as HintVariantId;
}

export function isRegisteredHintVariant(
  categoryCodename: string,
  id: string,
): boolean {
  if (!isSupportedCategoryCodename(categoryCodename)) return false;
  const { type } = categoryFromCodename(categoryCodename);
  return variantsOf(type).some((v) => v.id === id);
}

export function buildHint(
  type: OperationType,
  id: HintVariantId | null,
  operands: readonly number[],
): Hint {
  const variants = variantsOf(type);
  const variant = variants.find((v) => v.id === id) ?? variants[0];
  return variant.build(operands);
}
