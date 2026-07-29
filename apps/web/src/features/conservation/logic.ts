import { parseFormula, type AtomCounts } from "../reaction-furnace/logic";

export type ReactionCategory =
  | "synthesis"
  | "decomposition"
  | "replacement"
  | "exchange"
  | "neutralization"
  | "combustion"
  | "redox"
  | "life";

export type GameLevel = "starter" | "explorer" | "challenge";

export type ReactionSpecies = {
  formula: string;
  coefficient: number;
  atoms: AtomCounts;
};

export type ChemicalReaction = {
  id: string;
  title: string;
  reactants: readonly ReactionSpecies[];
  products: readonly ReactionSpecies[];
  category: ReactionCategory;
  level: GameLevel;
  condition: string;
  description: string;
  observation: string;
};

export type ReactionDraft = {
  id: string;
  title: string;
  equation: string;
  category: ReactionCategory;
  condition: string;
  description: string;
  observation: string;
  level?: GameLevel;
};

export type CoefficientGuess = {
  reactants: readonly (number | null)[];
  products: readonly (number | null)[];
};

export type BalanceRow = {
  symbol: string;
  left: number;
  right: number;
  balanced: boolean;
  difference: number;
};

export type BalanceResult =
  | { status: "incomplete" }
  | { status: "unbalanced"; focus: BalanceRow }
  | { status: "proportional"; commonFactor: number }
  | { status: "balanced" };

export type ReactionPuzzle = {
  reaction: ChemicalReaction;
  locked: {
    reactants: readonly boolean[];
    products: readonly boolean[];
  };
  initial: CoefficientGuess;
};

const CATEGORY_LABELS: Readonly<Record<ReactionCategory, string>> = {
  synthesis: "化合反应",
  decomposition: "分解反应",
  replacement: "置换反应",
  exchange: "复分解反应",
  neutralization: "酸碱反应",
  combustion: "燃烧反应",
  redox: "氧化还原",
  life: "生命与环境",
};

export { CATEGORY_LABELS };

function gcd(first: number, second: number): number {
  let a = Math.abs(first);
  let b = Math.abs(second);
  while (b) [a, b] = [b, a % b];
  return a;
}

export function coefficientGcd(coefficients: readonly number[]) {
  return coefficients.reduce((result, coefficient) => gcd(result, coefficient), 0);
}

function parseSpecies(token: string): ReactionSpecies {
  const match = token.trim().match(/^(?:(\d+)\s+)?(.+)$/u);
  if (!match) throw new Error(`无法解析反应物：${token}`);
  const coefficient = Number(match[1] ?? 1);
  const formula = match[2]!.trim();
  const atoms = parseFormula(formula);
  if (!atoms || !Number.isInteger(coefficient) || coefficient < 1) {
    throw new Error(`无效的化学式或系数：${token}`);
  }
  return { formula, coefficient, atoms };
}

function inferLevel(
  reactants: readonly ReactionSpecies[],
  products: readonly ReactionSpecies[],
): GameLevel {
  const species = [...reactants, ...products];
  const maxCoefficient = Math.max(...species.map((item) => item.coefficient));
  const elementCount = new Set(species.flatMap((item) => Object.keys(item.atoms))).size;
  const structuralComplexity = species.filter((item) => /[()[\]]/.test(item.formula)).length;
  const score = species.length + elementCount + maxCoefficient + structuralComplexity * 2;
  if (score <= 8) return "starter";
  if (score <= 14) return "explorer";
  return "challenge";
}

export function createReaction(draft: ReactionDraft): ChemicalReaction {
  const parts = draft.equation.split(/\s*(?:->|→)\s*/u);
  if (parts.length !== 2) throw new Error(`反应式必须只有一个箭头：${draft.equation}`);
  const reactants = parts[0]!.split(/\s+\+\s+/u).map(parseSpecies);
  const products = parts[1]!.split(/\s+\+\s+/u).map(parseSpecies);
  const reaction: ChemicalReaction = {
    ...draft,
    reactants,
    products,
    level: draft.level ?? inferLevel(reactants, products),
  };
  const validation = validateReaction(reaction);
  if (!validation.valid) throw new Error(`${draft.id}: ${validation.reason}`);
  return reaction;
}

function addAtoms(
  totals: Record<string, number>,
  atoms: AtomCounts,
  coefficient: number,
) {
  for (const [symbol, count] of Object.entries(atoms)) {
    totals[symbol] = (totals[symbol] ?? 0) + count * coefficient;
  }
}

export function sideAtomTotals(
  species: readonly ReactionSpecies[],
  coefficients: readonly (number | null)[],
  emptyValue = 1,
) {
  const totals: Record<string, number> = {};
  species.forEach((item, index) => {
    addAtoms(totals, item.atoms, coefficients[index] ?? emptyValue);
  });
  return totals;
}

export function balanceRows(
  reaction: ChemicalReaction,
  guess: CoefficientGuess,
  emptyValue = 1,
): BalanceRow[] {
  const left = sideAtomTotals(reaction.reactants, guess.reactants, emptyValue);
  const right = sideAtomTotals(reaction.products, guess.products, emptyValue);
  const symbols = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
  return symbols.map((symbol) => ({
    symbol,
    left: left[symbol] ?? 0,
    right: right[symbol] ?? 0,
    balanced: left[symbol] === right[symbol],
    difference: (left[symbol] ?? 0) - (right[symbol] ?? 0),
  }));
}

export function canonicalGuess(reaction: ChemicalReaction): CoefficientGuess {
  return {
    reactants: reaction.reactants.map((item) => item.coefficient),
    products: reaction.products.map((item) => item.coefficient),
  };
}

export function flattenGuess(guess: CoefficientGuess) {
  return [...guess.reactants, ...guess.products];
}

export function evaluateBalance(
  reaction: ChemicalReaction,
  guess: CoefficientGuess,
): BalanceResult {
  const coefficients = flattenGuess(guess);
  if (coefficients.some((coefficient) => coefficient === null)) return { status: "incomplete" };
  const rows = balanceRows(reaction, guess);
  const focus = [...rows]
    .filter((row) => !row.balanced)
    .sort((first, second) => Math.abs(second.difference) - Math.abs(first.difference))[0];
  if (focus) return { status: "unbalanced", focus };
  const commonFactor = coefficientGcd(coefficients as number[]);
  if (commonFactor > 1) return { status: "proportional", commonFactor };
  return { status: "balanced" };
}

export function validateReaction(reaction: ChemicalReaction) {
  const canonical = canonicalGuess(reaction);
  const rows = balanceRows(reaction, canonical);
  const unbalanced = rows.find((row) => !row.balanced);
  if (unbalanced) {
    return {
      valid: false as const,
      reason: `${unbalanced.symbol} 不守恒（${unbalanced.left} ≠ ${unbalanced.right}）`,
    };
  }
  const coefficients = flattenGuess(canonical) as number[];
  if (coefficientGcd(coefficients) !== 1) {
    return { valid: false as const, reason: "系数不是最简整数比" };
  }
  return { valid: true as const };
}

function shuffle<T>(items: readonly T[], random: () => number) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other]!, result[index]!];
  }
  return result;
}

export function selectRandomReactions(
  library: readonly ChemicalReaction[],
  count: number,
  level: GameLevel,
  random: () => number = Math.random,
) {
  const candidates = library.filter((reaction) => {
    if (level === "starter") return reaction.level === "starter";
    if (level === "explorer") return reaction.level !== "challenge";
    return reaction.level !== "starter";
  });
  const pool = candidates.length >= count ? candidates : library;
  return shuffle(pool, random).slice(0, Math.min(count, pool.length));
}

export function createPuzzle(
  reaction: ChemicalReaction,
  level: GameLevel,
  random: () => number = Math.random,
): ReactionPuzzle {
  const actual = flattenGuess(canonicalGuess(reaction)) as number[];
  const total = actual.length;
  const editableCount = level === "starter"
    ? Math.min(2, total)
    : level === "explorer"
      ? Math.max(2, total - 1)
      : total;
  const preferred = shuffle(
    actual.map((coefficient, index) => ({ coefficient, index })),
    random,
  ).sort((first, second) => Number(second.coefficient > 1) - Number(first.coefficient > 1));
  const editable = new Set(preferred.slice(0, editableCount).map((item) => item.index));
  const lockedFlat = actual.map((_, index) => !editable.has(index));
  const initialFlat = actual.map((coefficient, index) => (
    lockedFlat[index] ? coefficient : null
  ));
  const reactantCount = reaction.reactants.length;
  return {
    reaction,
    locked: {
      reactants: lockedFlat.slice(0, reactantCount),
      products: lockedFlat.slice(reactantCount),
    },
    initial: {
      reactants: initialFlat.slice(0, reactantCount),
      products: initialFlat.slice(reactantCount),
    },
  };
}

export function fillOneHint(
  puzzle: ReactionPuzzle,
  guess: CoefficientGuess,
): { guess: CoefficientGuess; filled: { side: "reactants" | "products"; index: number } | null } {
  const actual = canonicalGuess(puzzle.reaction);
  const reactantIndex = guess.reactants.findIndex((value, index) => (
    !puzzle.locked.reactants[index] && value !== actual.reactants[index]
  ));
  if (reactantIndex >= 0) {
    const reactants = [...guess.reactants];
    reactants[reactantIndex] = actual.reactants[reactantIndex]!;
    return { guess: { ...guess, reactants }, filled: { side: "reactants", index: reactantIndex } };
  }
  const productIndex = guess.products.findIndex((value, index) => (
    !puzzle.locked.products[index] && value !== actual.products[index]
  ));
  if (productIndex >= 0) {
    const products = [...guess.products];
    products[productIndex] = actual.products[productIndex]!;
    return { guess: { ...guess, products }, filled: { side: "products", index: productIndex } };
  }
  return { guess, filled: null };
}

export function formatBalancedEquation(reaction: ChemicalReaction) {
  const format = (species: readonly ReactionSpecies[]) => species
    .map((item) => `${item.coefficient === 1 ? "" : item.coefficient}${item.formula}`)
    .join(" + ");
  return `${format(reaction.reactants)} → ${format(reaction.products)}`;
}
