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

/** Rebuild the exact Operation a trial was, from its categoryCodename and operands() — the inverse of Operation.operands(). */
export function reconstructOperation(categoryCodename: string, operands: number[]): Operation {
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

export const operations: Operation[] = [
  createOperation("1d+1d"),
  createOperation("1dx1d"),
  createOperation("2d+2d"),
  createOperation("2dx1d"),
  createOperation("3dx1d"),
  createOperation("(2d)^2"),
  createOperation("4dx1d"),
  createOperation("(3d)^2"),
  createOperation("(4d)^2"),
];
