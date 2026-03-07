import {
  AdditionCategory,
  MultiplicationCategory,
  SquaringCategory,
} from "./category";
import { createRandomOperand, OperandOptions } from "./operand";

export abstract class Operation {
  static readonly restrictions: OperandOptions;
  abstract solveTime(): number;
  abstract result(): number;
  abstract humanReadable(): string;
  abstract categoryCodename(): string;
  hint(): string | undefined {
    return undefined;
  }
}

export class Addition extends Operation {
  constructor(
    private leftOperand: number,
    private rightOperand: number,
    private category: AdditionCategory,
  ) {
    super();
  }

  static restrictions = {
    allow_zero: false,
    allow_one: true,
    allow_multiples_of_ten: true,
  };

  static create(category: AdditionCategory) {
    const { lDigits, rDigits } = category;
    const leftOperand = createRandomOperand(lDigits, Addition.restrictions);
    const rightOperand = createRandomOperand(rDigits, Addition.restrictions);

    return new Addition(leftOperand, rightOperand, category);
  }

  solveTime(): number {
    const { lDigits, rDigits } = this.category;
    if (lDigits === 1 && rDigits === 1) return 7_000; // 1d+1d
    if (lDigits === 2 && rDigits === 2) return 11_000; // 2d+2d
    throw new Error(`Unsupported addition category: ${this.category.codename}`);
  }

  result(): number {
    return this.leftOperand + this.rightOperand;
  }

  categoryCodename(): string {
    return this.category.codename;
  }

  humanReadable(): string {
    return `${this.leftOperand} + ${this.rightOperand}`;
  }
}

export class Multiplication extends Operation {
  constructor(
    private leftOperand: number,
    private rightOperand: number,
    private category: MultiplicationCategory,
  ) {
    super();
  }

  static restrictions = {
    allow_zero: false,
    allow_one: false,
    allow_multiples_of_ten: false,
  };

  static create(category: MultiplicationCategory) {
    const { lDigits, rDigits } = category;
    const leftOperand = createRandomOperand(
      lDigits,
      Multiplication.restrictions,
    );
    const rightOperand = createRandomOperand(
      rDigits,
      Multiplication.restrictions,
    );
    return new Multiplication(leftOperand, rightOperand, category);
  }

  solveTime(): number {
    const { lDigits, rDigits } = this.category;
    if (lDigits === 1 && rDigits === 1) return 10_000; // 1dx1d
    if (lDigits === 2 && rDigits === 1) return 14_000; // 2dx1d
    if (lDigits === 3 && rDigits === 1) return 16_000; // 3dx1d
    if (lDigits === 4 && rDigits === 1) return 20_000; // 4dx1d
    throw new Error(
      `Unsupported multiplication category: ${this.category.codename}`,
    );
  }

  result(): number {
    return this.leftOperand * this.rightOperand;
  }

  categoryCodename(): string {
    return this.category.codename;
  }

  humanReadable(): string {
    return `${this.leftOperand} x ${this.rightOperand}`;
  }
}

export class Squaring extends Operation {
  constructor(
    private operand: number,
    private category: SquaringCategory,
  ) {
    super();
  }

  static restrictions = {
    allow_zero: true,
    allow_one: false,
    allow_multiples_of_ten: false,
  };

  static create(category: SquaringCategory) {
    const { digits } = category;
    const operand = createRandomOperand(digits, Squaring.restrictions);
    return new Squaring(operand, category);
  }

  solveTime(): number {
    const { digits } = this.category;
    if (digits === 2) return 16_000;
    if (digits === 3) return 34_000;
    if (digits === 4) return 80_000;
    throw new Error(`Unsupported squaring category: ${this.category.codename}`);
  }

  result(): number {
    return Math.pow(this.operand, 2);
  }

  categoryCodename(): string {
    return this.category.codename;
  }

  humanReadable(): string {
    return `${this.operand}²`;
  }

  hint() {
    return "TODO: implement squaring hint";
  }
}
