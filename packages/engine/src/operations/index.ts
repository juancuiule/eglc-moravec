import { categoryFromCodename } from "./category";
import { Addition, Multiplication, Operation, Squaring } from "./operation";

export function createOperation(codename: string): Operation {
  const category = categoryFromCodename(codename);
  if (!category) {
    throw new Error(`Unknown operation codename: ${codename}`);
  }

  switch (category.type) {
    case "addition":
      return Addition.create(category);
    case "multiplication":
      return Multiplication.create(category);
    case "squaring":
      return Squaring.create(category);
  }
}

export function reconstructOperation(
  categoryCodename: string,
  operands: number[],
): Operation {
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
