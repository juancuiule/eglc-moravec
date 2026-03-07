export type AdditionCategory = {
  type: "addition";
  codename: `${number}d+${number}d`;
  lDigits: number;
  rDigits: number;
};

export type MultiplicationCategory = {
  type: "multiplication";
  codename: `${number}dx${number}d`;
  lDigits: number;
  rDigits: number;
};

export type SquaringCategory = {
  type: "squaring";
  codename: `(${number}d)^2`;
  digits: number;
};

export type OperationCategory =
  | AdditionCategory
  | MultiplicationCategory
  | SquaringCategory;

const codenameRegex = {
  addition: /^(\d+)d\+(\d+)d$/,
  multiplication: /^(\d+)dx(\d+)d$/,
  squaring: /^\((\d+)d\)\^2$/,
};

export function categoryFromCodename(codename: string): OperationCategory {
  const type = typeFromCodename(codename);
  switch (type) {
    case "addition": {
      const match = codename.match(codenameRegex.addition);
      if (!match) throw new Error(`Invalid codename for addition: ${codename}`);
      const lDigits = parseInt(match[1], 10);
      const rDigits = parseInt(match[2], 10);
      return {
        type,
        codename: codename as AdditionCategory["codename"],
        lDigits,
        rDigits,
      };
    }
    case "multiplication": {
      const match = codename.match(codenameRegex.multiplication);
      if (!match)
        throw new Error(`Invalid codename for multiplication: ${codename}`);
      const lDigits = parseInt(match[1], 10);
      const rDigits = parseInt(match[2], 10);
      return {
        type,
        codename: codename as MultiplicationCategory["codename"],
        lDigits,
        rDigits,
      };
    }
    case "squaring": {
      const match = codename.match(codenameRegex.squaring);
      if (!match) throw new Error(`Invalid codename for squaring: ${codename}`);
      const digits = parseInt(match[1], 10);
      return {
        type,
        codename: codename as SquaringCategory["codename"],
        digits,
      };
    }
  }
}

function typeFromCodename(codename: string): OperationCategory["type"] {
  for (const [type, regex] of Object.entries(codenameRegex)) {
    if (regex.test(codename)) {
      return type as OperationCategory["type"];
    }
  }
  throw new Error(`Unknown operation for codename: ${codename}`);
}