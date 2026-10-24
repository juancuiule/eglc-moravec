import {
  AdditionCategory,
  categoryFromCodename,
  MultiplicationCategory,
  SquaringCategory,
} from "./category";
import { createRandomOperand, OperandOptions } from "./operand";
import type { Hint } from "./hints/Hint";
import { buildHint, type HintVariantId } from "./hints/variants";

export abstract class Operation {
  static readonly restrictions: OperandOptions;
  // Null when no variant was assigned; hint() then shows the type's first.
  constructor(readonly hintVariant: HintVariantId | null = null) {}
  abstract solveTime(): number;
  abstract result(): number;
  abstract humanReadable(): string;
  abstract categoryCodename(): string;
  abstract operands(): number[];
  hint(): Hint {
    const { type } = categoryFromCodename(this.categoryCodename());
    return buildHint(type, this.hintVariant, this.operands());
  }
}

export class Addition extends Operation {
  constructor(
    private leftOperand: number,
    private rightOperand: number,
    private category: AdditionCategory,
    hintVariant: HintVariantId | null = null,
  ) {
    super(hintVariant);
  }

  static restrictions = {
    allow_zero: false,
    allow_one: true,
    allow_multiples_of_ten: true,
  };

  static create(
    category: AdditionCategory,
    hintVariant: HintVariantId | null = null,
  ) {
    const { lDigits, rDigits } = category;
    const leftOperand = createRandomOperand(lDigits, Addition.restrictions);
    const rightOperand = createRandomOperand(rDigits, Addition.restrictions);

    return new Addition(leftOperand, rightOperand, category, hintVariant);
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

  operands(): number[] {
    return [this.leftOperand, this.rightOperand];
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
    hintVariant: HintVariantId | null = null,
  ) {
    super(hintVariant);
  }

  static restrictions = {
    allow_zero: false,
    allow_one: false,
    allow_multiples_of_ten: false,
  };

  static create(
    category: MultiplicationCategory,
    hintVariant: HintVariantId | null = null,
  ) {
    const { lDigits, rDigits } = category;
    const leftOperand = createRandomOperand(
      lDigits,
      Multiplication.restrictions,
    );
    const rightOperand = createRandomOperand(
      rDigits,
      Multiplication.restrictions,
    );
    return new Multiplication(leftOperand, rightOperand, category, hintVariant);
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

  operands(): number[] {
    return [this.leftOperand, this.rightOperand];
  }

  humanReadable(): string {
    return `${this.leftOperand} × ${this.rightOperand}`;
  }
}

export class Squaring extends Operation {
  constructor(
    private operand: number,
    private category: SquaringCategory,
    hintVariant: HintVariantId | null = null,
  ) {
    super(hintVariant);
  }

  static restrictions = {
    allow_zero: true,
    allow_one: false,
    allow_multiples_of_ten: false,
  };

  static create(
    category: SquaringCategory,
    hintVariant: HintVariantId | null = null,
  ) {
    const { digits } = category;
    const operand = createRandomOperand(digits, Squaring.restrictions);
    return new Squaring(operand, category, hintVariant);
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

  operands(): number[] {
    return [this.operand];
  }

  humanReadable(): string {
    return `${this.operand}²`;
  }
}
