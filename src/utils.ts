export const math = {
  pickRandom<T>(list: T[]): T {
    if (list.length === 0) {
      throw new Error("Cannot pick a random element from an empty list");
    }
    const index = Math.floor(Math.random() * list.length);
    return list[index];
  },
  pickRandomWeighted<T>(list: T[], weights: number[]): T {
    if (list.length === 0) {
      throw new Error("Cannot pick a random element from an empty list");
    }
    if (list.length !== weights.length) {
      throw new Error("List and weights must have the same length");
    }
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    if (totalWeight <= 0) {
      throw new Error("Total weight must be greater than zero");
    }
    let random = Math.random() * totalWeight;
    for (let i = 0; i < list.length; i++) {
      random -= weights[i];
      if (random < 0) {
        return list[i];
      }
    }
    throw new Error("Failed to pick a random element");
  },
  randomInt(min: number, max: number): number {
    if (min > max) {
      throw new Error("Min must be less than or equal to max");
    }
    return Math.floor(Math.random() * (max - min + 1)) + min;
  },
  sumBy<T>(list: T[], fn: (item: T) => number): number {
    return list.reduce((sum, item) => sum + fn(item), 0);
  },
  sum(list: number[]): number {
    return this.sumBy(list, (x) => x);
  },
};

export function getKeys<T extends object>(obj: T): (keyof T)[] {
  return Object.keys(obj) as (keyof T)[];
}

export function getValues<T extends object>(obj: T): T[keyof T][] {
  return Object.values(obj) as T[keyof T][];
}
