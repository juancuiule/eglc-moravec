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
  AdditionCategory | MultiplicationCategory | SquaringCategory;

const codenameRegex = {
  addition: /^(\d+)d\+(\d+)d$/,
  multiplication: /^(\d+)dx(\d+)d$/,
  squaring: /^\((\d+)d\)\^2$/,
};

export function categoryFromCodename(codename: string): OperationCategory {
  const type = typeFromCodename(codename);
  switch (type) {
    case "addition": {
      const [, lDigits, rDigits] = matchCodename(codename, type);
      return {
        type,
        codename: codename as AdditionCategory["codename"],
        lDigits: parseInt(lDigits, 10),
        rDigits: parseInt(rDigits, 10),
      };
    }
    case "multiplication": {
      const [, lDigits, rDigits] = matchCodename(codename, type);
      return {
        type,
        codename: codename as MultiplicationCategory["codename"],
        lDigits: parseInt(lDigits, 10),
        rDigits: parseInt(rDigits, 10),
      };
    }
    case "squaring": {
      const [, digits] = matchCodename(codename, type);
      return {
        type,
        codename: codename as SquaringCategory["codename"],
        digits: parseInt(digits, 10),
      };
    }
  }
}

function matchCodename(
  codename: string,
  type: OperationCategory["type"],
): RegExpMatchArray {
  const match = codename.match(codenameRegex[type]);
  if (!match) throw new Error(`Invalid codename for ${type}: ${codename}`);
  return match;
}

function typeFromCodename(codename: string): OperationCategory["type"] {
  const entry = Object.entries(codenameRegex).find(([, regex]) =>
    regex.test(codename),
  );
  if (!entry) throw new Error(`Unknown operation for codename: ${codename}`);
  return entry[0] as OperationCategory["type"];
}
