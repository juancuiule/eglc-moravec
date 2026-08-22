import { createOperation, type OperationCategory, Operation, getKeys, getValues, math } from "engine";

export type Level = Record<OperationCategory["codename"], number>;

export function createRandomOperation(level: Level): Operation {
  const categories = getKeys(level);
  const probabilities = getValues(level);

  const randomCategory = math.pickRandomWeighted(categories, probabilities);

  return createOperation(randomCategory);
}
