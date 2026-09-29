import { cardIds, evaluate, initialBoard, needsParentheses, OPERATORS, type Expression, type Operator } from "./twenty-four-engine.js";
export type BracketGroup = { start: number; end: number };
export type EquationEditor = {
  version: 2; slots: (number | null)[]; operators: (Operator | null)[];
  groups: BracketGroup[]; pendingStart: number | null;
};
export function emptyEditor(): EquationEditor {
  return { version: 2, slots: [null, null, null, null], operators: [null, null, null], groups: [], pendingStart: null };
}
export function canGroup(groups: BracketGroup[], start: number, end: number) {
  return Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end <= 3 && start < end
    && groups.length < 2 && groups.every(g => end < g.start || start > g.end);
}
function canLegacyGroup(groups: BracketGroup[], start: number, end: number) {
  return Number.isInteger(start) && Number.isInteger(end) && start >= 0 && start < end && end <= 3 && groups.length < 3
    && groups.every(g => !(g.start === start && g.end === end)
      && !(g.start < start && start <= g.end && g.end < end)
      && !(start < g.start && g.start <= end && end < g.end));
}
export type LegacyEditor = Omit<EquationEditor, "version" | "operators"> & { version: 1; operators: Operator[] };
export function isLegacyEditor(raw: unknown): raw is LegacyEditor { return validateEditor(raw, true); }
export function isEditor(raw: unknown): raw is EquationEditor { return validateEditor(raw, false); }
function validateEditor(raw: unknown, legacy: boolean) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  const e = raw as EquationEditor;
  if (Object.keys(e).sort().join() !== "groups,operators,pendingStart,slots,version" || e.version !== (legacy ? 1 : 2)
    || !Array.isArray(e.slots) || e.slots.length !== 4 || !e.slots.every(v => v === null || (Number.isInteger(v) && v >= 0 && v <= 7))
    || new Set(e.slots.filter(v => v !== null)).size !== e.slots.filter(v => v !== null).length
    || !Array.isArray(e.operators) || e.operators.length !== 3 || !e.operators.every(op => (!legacy && op === null) || OPERATORS.includes(op!))
    || !Array.isArray(e.groups) || e.groups.length > 3
    || !(e.pendingStart === null || (Number.isInteger(e.pendingStart) && e.pendingStart >= 0 && e.pendingStart < 3))) return false;
  const groups: BracketGroup[] = [];
  for (const g of e.groups) {
    if (!g || typeof g !== "object" || Object.keys(g).sort().join() !== "end,start" || !(legacy ? canLegacyGroup : canGroup)(groups, g.start, g.end)) return false;
    groups.push(g);
  }
  return e.pendingStart === null || [1, 2, 3].some(end => (legacy ? canLegacyGroup : canGroup)(groups, e.pendingStart!, end));
}
export function parseEditor(e: EquationEditor): Expression {
  if (!isEditor(e)) throw new Error("数字或括号信息不完整");
  if (e.pendingStart !== null) throw new Error("先给左括号配上右括号吧");
  if (e.slots.some(card => card === null)) throw new Error("先选好四个数字吧");
  if (e.operators.some(op => op === null)) throw new Error("再选好三个运算符吧");
  return parseComplete(e);
}
function parseComplete(e: EquationEditor | LegacyEditor): Expression {
  const values: Expression[] = [], operators: (Operator | "(")[] = [];
  const rank = (op: Operator) => op === "*" || op === "/" ? 2 : 1;
  function reduce() {
    const op = operators.pop(), right = values.pop(), left = values.pop();
    if (!op || op === "(" || !left || !right) throw new Error("括号还没有配好");
    values.push({ op, left, right });
  }
  for (let i = 0; i < 4; i++) {
    for (const _ of e.groups.filter(g => g.start === i)) operators.push("(");
    values.push({ card: e.slots[i]! });
    for (const _ of e.groups.filter(g => g.end === i)) {
      while (operators.at(-1) !== "(") reduce();
      operators.pop();
    }
    if (i < 3) {
      const op = e.operators[i]!;
      while (operators.length && operators.at(-1) !== "(" && rank(operators.at(-1) as Operator) >= rank(op)) reduce();
      operators.push(op);
    }
  }
  while (operators.length) reduce();
  if (values.length !== 1) throw new Error("算式还没有完成");
  return values[0];
}
// Expand legacy blocks with only precedence-required parentheses.
export function editorFromBoard(board: Expression[]): EquationEditor {
  if (board.every(node => "card" in node)) return emptyEditor();
  const editor: EquationEditor = { version: 2, slots: [], operators: [], groups: [], pendingStart: null };
  function walk(node: Expression, grouped: boolean) {
    const start = editor.slots.length;
    if ("card" in node) editor.slots.push(node.card);
    else {
      walk(node.left, needsParentheses(node.left, node.op, false)); editor.operators.push(node.op); walk(node.right, needsParentheses(node.right, node.op, true));
      if (grouped) editor.groups.push({ start, end: editor.slots.length - 1 });
    }
  }
  const nodes = [...board].sort((a, b) => cardIds(b).length - cardIds(a).length);
  for (const node of nodes) {
    if (editor.slots.length + cardIds(node).length > 4) continue;
    if (editor.slots.length) editor.operators.push("+");
    walk(node, !("card" in node) && cardIds(node).length < 4);
    if (editor.slots.length === 4) break;
  }
  for (const node of initialBoard()) {
    if (editor.slots.length === 4) break;
    if ("card" in node && !editor.slots.includes(node.card)) {
      if (editor.slots.length) editor.operators.push("+");
      editor.slots.push(node.card);
    }
  }
  return isEditor(editor) ? editor : emptyEditor();
}
export function editorResult(editor: EquationEditor, cards: number[]) { return evaluate(parseEditor(editor), cards); }

// Retain legacy state on disk; expose only the simplified editor to the new UI.
export function normalizeEditor(editor: EquationEditor | LegacyEditor | null, board: Expression[]): EquationEditor {
  if (!editor) return editorFromBoard(board);
  if (editor.version === 2) return editor;
  const converted = { ...editor, version: 2 as const, pendingStart: null };
  if (isEditor(converted)) return { ...converted, pendingStart: editor.pendingStart !== null && [1, 2, 3].some(end => canGroup(converted.groups, editor.pendingStart!, end)) ? editor.pendingStart : null };
  if (editor.slots.every(id => id !== null)) return editorFromBoard([parseComplete(editor)]);
  return emptyEditor();
}
