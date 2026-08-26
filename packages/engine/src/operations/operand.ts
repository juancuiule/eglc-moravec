import { math } from "../utils";

export type OperandOptions = {
  allow_zero?: boolean;
  allow_one?: boolean;
  allow_multiples_of_ten?: boolean;
};

const defaultOptions: Required<OperandOptions> = {
  allow_zero: true,
  allow_one: true,
  allow_multiples_of_ten: true,
};

function randomNonMultipleOfTen(min: number, max: number): number {
  const value = math.randomInt(min, max);
  return value % 10 === 0 ? randomNonMultipleOfTen(min, max) : value;
}

export function createRandomOperand(
  digits: number,
  options?: OperandOptions,
): number {
  const { allow_multiples_of_ten, allow_one, allow_zero } = {
    ...defaultOptions,
    ...options,
  };

  if (digits <= 0) {
    throw new Error("Digits must be a positive integer");
  }

  if (digits === 1) {
    const possibleValues = [
      ...(allow_zero ? [0] : []),
      ...(allow_one ? [1] : []),
      ...Array.from({ length: 8 }, (_, i) => i + 2),
    ];

    return math.pickRandom(possibleValues);
  } else {
    const min = Math.pow(10, digits - 1);
    const max = Math.pow(10, digits) - 1;
    return allow_multiples_of_ten
      ? math.randomInt(min, max)
      : randomNonMultipleOfTen(min, max);
  }
}
