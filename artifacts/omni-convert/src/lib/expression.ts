/**
 * A small, safe arithmetic-expression evaluator.
 *
 * Expressions such as `12 * 3.5`, `sqrt(144)`, `2^10`, or `1e-3 + pi` are
 * tokenised and parsed with a recursive-descent parser. Nothing here uses
 * `eval` or `new Function`, so user input can never execute arbitrary code.
 * Only a fixed whitelist of operators, constants, and pure math functions is
 * available.
 *
 * Trigonometry uses radians. Results must be finite; domain errors (for
 * example `sqrt(-1)` or division by zero) raise a descriptive
 * `ExpressionError`.
 */

export class ExpressionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExpressionError";
  }
}

type TokenType = "number" | "identifier" | "operator" | "lparen" | "rparen" | "comma";

interface Token {
  type: TokenType;
  value: string;
  position: number;
}

const CONSTANTS: Readonly<Record<string, number>> = {
  pi: Math.PI,
  e: Math.E,
  tau: Math.PI * 2,
};

type MathFn = (...args: number[]) => number;

const FUNCTIONS: Readonly<Record<string, { arity: number | [number, number]; fn: MathFn }>> = {
  sqrt: { arity: 1, fn: Math.sqrt },
  cbrt: { arity: 1, fn: Math.cbrt },
  abs: { arity: 1, fn: Math.abs },
  exp: { arity: 1, fn: Math.exp },
  ln: { arity: 1, fn: Math.log },
  log: { arity: 1, fn: Math.log },
  log10: { arity: 1, fn: Math.log10 },
  log2: { arity: 1, fn: Math.log2 },
  sin: { arity: 1, fn: Math.sin },
  cos: { arity: 1, fn: Math.cos },
  tan: { arity: 1, fn: Math.tan },
  asin: { arity: 1, fn: Math.asin },
  acos: { arity: 1, fn: Math.acos },
  atan: { arity: 1, fn: Math.atan },
  round: { arity: 1, fn: Math.round },
  floor: { arity: 1, fn: Math.floor },
  ceil: { arity: 1, fn: Math.ceil },
  sign: { arity: 1, fn: Math.sign },
  pow: { arity: 2, fn: Math.pow },
  min: { arity: [1, 8], fn: Math.min },
  max: { arity: [1, 8], fn: Math.max },
  hypot: { arity: [1, 8], fn: Math.hypot },
  atan2: { arity: 2, fn: Math.atan2 },
};

function isDigit(char: string): boolean {
  return char >= "0" && char <= "9";
}

function isIdentifierStart(char: string): boolean {
  return (char >= "a" && char <= "z") || (char >= "A" && char <= "Z") || char === "_";
}

function isIdentifierPart(char: string): boolean {
  return isIdentifierStart(char) || isDigit(char);
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;

  while (index < input.length) {
    const char = input[index];

    if (char === " " || char === "\t" || char === "\n" || char === "\r") {
      index += 1;
      continue;
    }

    if (char === "(") {
      tokens.push({ type: "lparen", value: char, position: index });
      index += 1;
      continue;
    }
    if (char === ")") {
      tokens.push({ type: "rparen", value: char, position: index });
      index += 1;
      continue;
    }
    if (char === ",") {
      tokens.push({ type: "comma", value: char, position: index });
      index += 1;
      continue;
    }

    if ("+-*/%^".includes(char)) {
      tokens.push({ type: "operator", value: char, position: index });
      index += 1;
      continue;
    }

    if (isDigit(char) || (char === "." && isDigit(input[index + 1] ?? ""))) {
      const start = index;
      while (index < input.length && isDigit(input[index] ?? "")) index += 1;
      if (input[index] === ".") {
        index += 1;
        while (index < input.length && isDigit(input[index] ?? "")) index += 1;
      }
      if (input[index] === "e" || input[index] === "E") {
        const next = input[index + 1];
        const sign = input[index + 1] === "+" || input[index + 1] === "-";
        const hasExponentDigit = isDigit(input[index + (sign ? 2 : 1)] ?? "");
        if (next !== undefined && (isDigit(next) || (sign && hasExponentDigit))) {
          index += sign ? 2 : 1;
          while (index < input.length && isDigit(input[index] ?? "")) index += 1;
        }
      }
      const raw = input.slice(start, index);
      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) {
        throw new ExpressionError(`Invalid number "${raw}".`);
      }
      tokens.push({ type: "number", value: raw, position: start });
      continue;
    }

    if (isIdentifierStart(char)) {
      const start = index;
      while (index < input.length && isIdentifierPart(input[index] ?? "")) index += 1;
      tokens.push({ type: "identifier", value: input.slice(start, index), position: start });
      continue;
    }

    throw new ExpressionError(`Unexpected character "${char}".`);
  }

  tokens.push({ type: "operator", value: "", position: input.length });
  return tokens;
}

class Parser {
  private position = 0;
  private readonly tokens: Token[];

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(): Token {
    return this.tokens[this.position]!;
  }

  private next(): Token {
    return this.tokens[this.position++]!;
  }

  parse(): number {
    const value = this.parseExpression();
    if (this.peek().type !== "operator" || this.peek().value !== "") {
      throw new ExpressionError("Unexpected trailing input in expression.");
    }
    return value;
  }

  private parseExpression(): number {
    let left = this.parseTerm();
    for (;;) {
      const token = this.peek();
      if (token.type === "operator" && (token.value === "+" || token.value === "-")) {
        this.next();
        const right = this.parseTerm();
        left = token.value === "+" ? left + right : left - right;
      } else {
        return left;
      }
    }
  }

  private parseTerm(): number {
    let left = this.parsePower();
    for (;;) {
      const token = this.peek();
      if (token.type === "operator" && (token.value === "*" || token.value === "/" || token.value === "%")) {
        this.next();
        const right = this.parsePower();
        if ((token.value === "/" || token.value === "%") && right === 0) {
          throw new ExpressionError("Division by zero is not allowed.");
        }
        left = token.value === "*" ? left * right : token.value === "/" ? left / right : left % right;
      } else {
        return left;
      }
    }
  }

  private parsePower(): number {
    const base = this.parseUnary();
    const token = this.peek();
    if (token.type === "operator" && token.value === "^") {
      this.next();
      const exponent = this.parsePower();
      return Math.pow(base, exponent);
    }
    return base;
  }

  private parseUnary(): number {
    const token = this.peek();
    if (token.type === "operator" && (token.value === "+" || token.value === "-")) {
      this.next();
      const value = this.parseUnary();
      return token.value === "-" ? -value : value;
    }
    return this.parsePrimary();
  }

  private parsePrimary(): number {
    const token = this.next();

    if (token.type === "number") {
      return Number(token.value);
    }

    if (token.type === "lparen") {
      const value = this.parseExpression();
      const close = this.next();
      if (close.type !== "rparen") {
        throw new ExpressionError("Missing closing parenthesis.");
      }
      return value;
    }

    if (token.type === "identifier") {
      const name = token.value.toLowerCase();
      if (name in CONSTANTS) {
        return CONSTANTS[name]!;
      }
      const fn = FUNCTIONS[name];
      if (!fn) {
        throw new ExpressionError(`Unknown name "${token.value}".`);
      }
      const open = this.next();
      if (open.type !== "lparen") {
        throw new ExpressionError(`Function "${token.value}" must be called with parentheses.`);
      }
      const args: number[] = [];
      if (this.peek().type !== "rparen") {
        args.push(this.parseExpression());
        while (this.peek().type === "comma") {
          this.next();
          args.push(this.parseExpression());
        }
      }
      const close = this.next();
      if (close.type !== "rparen") {
        throw new ExpressionError("Missing closing parenthesis.");
      }
      const [min, max] = Array.isArray(fn.arity) ? fn.arity : [fn.arity, fn.arity];
      if (args.length < min || args.length > max) {
        throw new ExpressionError(`Function "${token.value}" expects ${min === max ? min : `${min}-${max}`} argument(s).`);
      }
      return fn.fn(...args);
    }

    throw new ExpressionError("Unexpected end of expression.");
  }
}

/** Evaluate an expression, throwing `ExpressionError` on invalid input. */
export function evaluateExpression(input: string): number {
  const trimmed = input.trim();
  if (trimmed === "") {
    throw new ExpressionError("Enter an expression to evaluate.");
  }
  const result = new Parser(tokenize(trimmed)).parse();
  if (Number.isNaN(result)) {
    throw new ExpressionError("The expression produced a value that is not a number.");
  }
  if (!Number.isFinite(result)) {
    throw new ExpressionError("The expression produced a value that is too large to represent.");
  }
  return result;
}

export interface ExpressionResult {
  ok: boolean;
  value: number;
  error?: string;
}

/** Non-throwing wrapper used by the interface to show inline validation. */
export function tryEvaluateExpression(input: string): ExpressionResult {
  try {
    return { ok: true, value: evaluateExpression(input) };
  } catch (error) {
    return {
      ok: false,
      value: Number.NaN,
      error: error instanceof Error ? error.message : "Invalid expression.",
    };
  }
}

/** True when the text contains characters that make it worth parsing as math. */
export function looksLikeExpression(input: string): boolean {
  const trimmed = input.trim();
  const body = /^[+-]/.test(trimmed) ? trimmed.slice(1) : trimmed;
  return /[+\-*/%^()a-zA-Z]/.test(body);
}
