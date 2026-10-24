import { categoryFromCodename, operandsMatchCategory } from "./category";
import { assignHintVariant } from "./hints/variants";
import { Addition, Multiplication, Operation, Squaring } from "./operation";

// `hintSeed` identifies the player (see assignHintVariant); without it the
// Operation records no hint variant.
export function createOperation(
  codename: string,
  hintSeed?: string,
): Operation {
  const category = categoryFromCodename(codename);
  if (!category) {
    throw new Error(`Unknown operation codename: ${codename}`);
  }
  const hintVariant =
    hintSeed === undefined ? null : assignHintVariant(hintSeed, category.type);

  switch (category.type) {
    case "addition":
      return Addition.create(category, hintVariant);
    case "multiplication":
      return Multiplication.create(category, hintVariant);
    case "squaring":
      return Squaring.create(category, hintVariant);
  }
}

export function reconstructOperation(
  categoryCodename: string,
  operands: number[],
): Operation {
  if (!operandsMatchCategory(categoryCodename, operands)) {
    throw new Error(`Invalid operands for category: ${categoryCodename}`);
  }
  const category = categoryFromCodename(categoryCodename);

  switch (category.type) {
    case "addition":
      return new Addition(operands[0], operands[1], category);
    case "multiplication":
      return new Multiplication(operands[0], operands[1], category);
    case "squaring":
      return new Squaring(operands[0], category);
  }
}
