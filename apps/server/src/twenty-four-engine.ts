export const OPERATORS = ["+", "-", "*", "/"] as const;
export type Operator = typeof OPERATORS[number];
export type Expression = { card: number } | { op: Operator; left: Expression; right: Expression };
export type Fraction = { n: bigint; d: bigint };
export const SYMBOLS: Record<Operator, string> = { "+": "+", "-": "−", "*": "×", "/": "÷" };
export const REWARD_TIERS = [
  { maxMs: 60_000, coins: 40, label: "1 分钟内" },
  { maxMs: 180_000, coins: 30, label: "3 分钟内" },
  { maxMs: 300_000, coins: 20, label: "5 分钟内" },
  { maxMs: Number.MAX_SAFE_INTEGER, coins: 10, label: "慢慢想也有" },
] as const;
export function rewardForTime(elapsedMs: number, assisted: boolean) {
  if (!Number.isSafeInteger(elapsedMs) || elapsedMs < 0) throw new Error("计时信息不完整");
  return assisted ? 5 : REWARD_TIERS.find(tier => elapsedMs <= tier.maxMs)!.coins;
}
export function fraction(n: bigint, d = 1n): Fraction {
  if (d === 0n) throw new Error("0 不能作除数，换一种运算试试");
  if (d < 0n) { n = -n; d = -d; }
  let a = n < 0n ? -n : n, b = d;
  while (b) [a, b] = [b, a % b];
  return { n: n / a, d: d / a };
}
export function calculate(a: Fraction, op: Operator, b: Fraction): Fraction {
  switch (op) {
    case "+": return fraction(a.n * b.d + b.n * a.d, a.d * b.d);
    case "-": return fraction(a.n * b.d - b.n * a.d, a.d * b.d);
    case "*": return fraction(a.n * b.n, a.d * b.d);
    case "/": return fraction(a.n * b.d, a.d * b.n);
    default: throw new Error("请选择加、减、乘或除");
  }
}
export function isExpression(raw: unknown): raw is Expression {
  const stack: unknown[] = [raw]; let count = 0;
  while (stack.length) {
    if (++count > 7) return false;
    const node = stack.pop();
    if (!node || typeof node !== "object" || Array.isArray(node)) return false;
    const item = node as Record<string, unknown>;
    if ("card" in item) {
      if (Object.keys(item).length !== 1 || !Number.isInteger(item.card) || Number(item.card) < 0 || Number(item.card) > 7) return false;
    } else {
      if (Object.keys(item).length !== 3 || !OPERATORS.includes(item.op as Operator)) return false;
      stack.push(item.left, item.right);
    }
  }
  return true;
}
export function cardIds(node: Expression): number[] {
  return "card" in node ? [node.card] : [...cardIds(node.left), ...cardIds(node.right)];
}
export function evaluate(node: Expression, cards: number[]): Fraction {
  if ("card" in node) {
    const value = cards[node.card];
    if (!Number.isInteger(value) || value < 0 || value > 13) throw new Error("请选择本题的数字");
    return fraction(BigInt(value));
  }
  return calculate(evaluate(node.left, cards), node.op, evaluate(node.right, cards));
}
export function formatFraction(value: Fraction) { return value.d === 1n ? String(value.n) : `${value.n}/${value.d}`; }
export function needsParentheses(node: Expression, parent: Operator, right: boolean) {
  if ("card" in node) return false;
  const rank = (op: Operator) => op === "*" || op === "/" ? 2 : 1;
  return rank(node.op) < rank(parent) || (right && rank(node.op) === rank(parent));
}
export function bracketDepth(node: Expression): number {
  if ("card" in node) return 0;
  return Math.max(bracketDepth(node.left) + Number(needsParentheses(node.left, node.op, false)),
    bracketDepth(node.right) + Number(needsParentheses(node.right, node.op, true)));
}
export function formatExpression(node: Expression, cards: number[]): string {
  if ("card" in node) return String(cards[node.card]);
  const child = (n: Expression, right: boolean) => {
    const text = formatExpression(n, cards);
    return needsParentheses(n, node.op, right) ? `(${text})` : text;
  };
  return `${child(node.left, false)} ${SYMBOLS[node.op]} ${child(node.right, true)}`;
}
export function cardMark(value: number) { return ({ 1: "A", 11: "J", 12: "Q", 13: "K" } as Record<number, string>)[value] ?? String(value); }
export function initialBoard(): Expression[] { return Array.from({ length: 8 }, (_, card) => ({ card })); }
export function isSolved(node: Expression, cards: number[]) {
  const ids = cardIds(node), value = evaluate(node, cards);
  return ids.length === 4 && new Set(ids).size === 4 && value.n === 24n * value.d;
}
export function validBoard(board: Expression[], cards: number[]) {
  try {
    const ids = board.flatMap(cardIds);
    return cards.length === 8 && cards.every(n => Number.isInteger(n) && n >= 0 && n <= 13)
      && ids.length === 8 && new Set(ids).size === 8
      && board.every(node => isExpression(node) && cardIds(node).length <= 4 && !!evaluate(node, cards));
  } catch { return false; }
}
export function mergeBoard(board: Expression[], cards: number[], left: number, right: number, op: Operator) {
  if (!Number.isInteger(left) || !Number.isInteger(right) || left === right || !board[left] || !board[right]) throw new Error("先选两个不同的数字或算式");
  const node: Expression = { op, left: board[left], right: board[right] };
  if (cardIds(node).length > 4) throw new Error("一个算式最多用 4 张数字，撤销一步再试试");
  evaluate(node, cards);
  return [...board.filter((_, i) => i !== left && i !== right), node];
}

// Exhaustive pair reduction covers every binary parenthesization and both orders
// of subtraction/division. Rational arithmetic also finds 8 ÷ (3 − 8 ÷ 3).
export function solveFour(cards: number[], ids = [0, 1, 2, 3], integerOnly = false, singleLayer = false): Expression | null {
  type Term = { node: Expression; value: Fraction };
  const dead = new Set<string>();
  function search(terms: Term[]): Expression | null {
    if (terms.length === 1) return terms[0].value.n === 24n * terms[0].value.d ? terms[0].node : null;
    const key = terms.map(t => singleLayer ? JSON.stringify(t.node) : formatFraction(t.value)).sort().join(",");
    if (dead.has(key)) return null;
    for (let i = 0; i < terms.length; i++) for (let j = i + 1; j < terms.length; j++) {
      const rest = terms.filter((_, k) => k !== i && k !== j);
      const orders: [Term, Operator, Term][] = [
        [terms[i], "+", terms[j]], [terms[i], "*", terms[j]],
        [terms[i], "-", terms[j]], [terms[j], "-", terms[i]],
        [terms[i], "/", terms[j]], [terms[j], "/", terms[i]],
      ];
      for (const [a, op, b] of orders) {
        if (op === "/" && b.value.n === 0n) continue;
        const value = calculate(a.value, op, b.value);
        if (integerOnly && (value.d !== 1n || value.n < 0n)) continue;
        const node = { op, left: a.node, right: b.node };
        if (singleLayer && bracketDepth(node) > 1) continue;
        const result = search([...rest, { node, value }]);
        if (result) return result;
      }
    }
    dead.add(key); return null;
  }
  return search(ids.map(card => ({ node: { card }, value: fraction(BigInt(cards[card])) })));
}
export function generatePuzzle(random: () => number = Math.random) {
  const pick = (max: number) => Math.min(max - 1, Math.max(0, Math.floor(random() * max)));
  let base: number[] = [3, 3, 4, 4], solution: Expression | null = null;
  // Prefer a solution with nonnegative integer intermediate results for children.
  for (let attempt = 0; attempt < 80; attempt++) {
    base = Array.from({ length: 4 }, () => pick(14));
    solution = solveFour(base, [0, 1, 2, 3], true, true);
    if (solution) break;
  }
  if (!solution) { base = [3, 3, 4, 4]; solution = solveFour(base, [0, 1, 2, 3], true, true)!; }
  const indexed = [...base, ...Array.from({ length: 4 }, () => pick(14))].map((value, id) => ({ value, id }));
  for (let i = 7; i > 0; i--) { const j = pick(i + 1); [indexed[i], indexed[j]] = [indexed[j], indexed[i]]; }
  function remap(node: Expression): Expression {
    return "card" in node ? { card: indexed.findIndex(item => item.id === node.card) }
      : { op: node.op, left: remap(node.left), right: remap(node.right) };
  }
  return { cards: indexed.map(item => item.value), solution: remap(solution) };
}
export function solutionSteps(node: Expression, cards: number[]): string[] {
  if ("card" in node) return [];
  return [...solutionSteps(node.left, cards), ...solutionSteps(node.right, cards),
    `${formatFraction(evaluate(node.left, cards))} ${SYMBOLS[node.op]} ${formatFraction(evaluate(node.right, cards))} = ${formatFraction(evaluate(node, cards))}`];
}

// Old saved puzzles keep their cards; find a single-layer reference among any four.
export function singleLayerSolution(cards: number[], previous: Expression): Expression {
  if (bracketDepth(previous) <= 1) return previous;
  for (let a = 0; a < 5; a++) for (let b = a + 1; b < 6; b++)
    for (let c = b + 1; c < 7; c++) for (let d = c + 1; d < 8; d++) {
      const answer = solveFour(cards, [a, b, c, d], false, true);
      if (answer) return answer;
    }
  throw new Error("旧题暂未找到单层括号解");
}
