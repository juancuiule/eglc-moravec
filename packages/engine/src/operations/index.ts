import { categoryFromCodename } from "./category.js";
import { Addition, Multiplication, Operation, Squaring } from "./operation.js";

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
