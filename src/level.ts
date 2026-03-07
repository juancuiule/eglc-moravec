import { createOperation } from "./operations";
import { OperationCategory } from "./operations/category";
import { Operation } from "./operations/operation";
import { getKeys, getValues, math } from "./utils";

export type Level = Record<OperationCategory["codename"], number>;

export function createRandomOperation(level: Level): Operation {
  const categories = getKeys(level);
  const probabilities = getValues(level);

  const randomCategory = math.pickRandomWeighted(categories, probabilities);

  return createOperation(randomCategory);
}
