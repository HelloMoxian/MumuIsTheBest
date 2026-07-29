import { extractAnswerCandidates } from "../add-subtract/logic";

export type BattleQuestionCount = 1 | 2 | 3 | 4 | 5;
export type BattleDifficulty = "easy" | "medium" | "hard";
export type BattleOperator = "+" | "-" | "×" | "÷";

export type BattleQuestion = {
  id: string;
  operands: number[];
  operators: BattleOperator[];
  expression: string;
  answer: number;
};

export type SolvedBattleQuestion = BattleQuestion & {
  solvedDurationMs: number;
  solvedAtOffsetMs: number;
  solvedOrder: number;
};

export type StoredBattleSession = {
  id: string;
  startedAt: string;
  completedAt: string;
  createdAt: string;
  updatedAt: string;
  questionCount: BattleQuestionCount;
  difficulty: BattleDifficulty;
  childAge: number;
  totalDurationMs: number;
  calculationDurationMs: number;
  asrSessionCount: number;
  questions: SolvedBattleQuestion[];
  correctCount: number;
  accuracy: number;
};

export type BattleHistoryGroup = {
  key: string;
  questionCount: BattleQuestionCount;
  difficulty: BattleDifficulty;
  sessions: number;
  averageTotalDurationMs: number;
  averageQuestionDurationMs: number;
  averageCalculationDurationMs: number;
  childAge: number;
  accuracy: number;
};

function integer(random: () => number, minimum: number, maximum: number) {
  return minimum + Math.floor(random() * (maximum - minimum + 1));
}

function pick<T>(items: readonly T[], random: () => number): T {
  return items[Math.min(items.length - 1, Math.floor(random() * items.length))]!;
}

export function evaluateBattleExpression(
  operands: number[],
  operators: BattleOperator[],
): number | null {
  if (operands.length < 2 || operands.length !== operators.length + 1) return null;
  if (operands.some((operand) => !Number.isInteger(operand) || operand < 0)) return null;

  const reducedValues = [operands[0]!];
  const reducedOperators: Array<"+" | "-"> = [];
  for (let index = 0; index < operators.length; index += 1) {
    const operator = operators[index]!;
    const nextValue = operands[index + 1]!;
    if (operator === "×") {
      reducedValues[reducedValues.length - 1] = reducedValues.at(-1)! * nextValue;
    } else if (operator === "÷") {
      const current = reducedValues.at(-1)!;
      if (nextValue === 0 || current % nextValue !== 0) return null;
      reducedValues[reducedValues.length - 1] = current / nextValue;
    } else {
      reducedOperators.push(operator);
      reducedValues.push(nextValue);
    }
  }

  let result = reducedValues[0]!;
  for (let index = 0; index < reducedOperators.length; index += 1) {
    result = reducedOperators[index] === "+"
      ? result + reducedValues[index + 1]!
      : result - reducedValues[index + 1]!;
  }
  return Number.isInteger(result) ? result : null;
}

export function formatBattleExpression(
  operands: number[],
  operators: BattleOperator[],
): string {
  return operands.map((operand, index) => (
    index === 0 ? String(operand) : `${operators[index - 1]} ${operand}`
  )).join(" ");
}

function hasCarryOrBorrow(operands: number[], operators: BattleOperator[]): boolean {
  let running = operands[0]!;
  for (let index = 0; index < operators.length; index += 1) {
    const operator = operators[index]!;
    const next = operands[index + 1]!;
    if (operator === "+" && running % 10 + next % 10 >= 10) return true;
    if (operator === "-" && running >= next && running % 10 < next % 10) return true;
    running = operator === "+" ? running + next : running - next;
  }
  return false;
}

function hasValidEasyIntermediates(operands: number[], operators: BattleOperator[]) {
  let running = operands[0]!;
  for (let index = 0; index < operators.length; index += 1) {
    running = operators[index] === "+"
      ? running + operands[index + 1]!
      : running - operands[index + 1]!;
    if (running < 0 || running > 100) return false;
  }
  return true;
}

function noMultiplicativeChain(operators: BattleOperator[]) {
  return operators.every((operator, index) => {
    if (index === 0) return true;
    const previous = operators[index - 1]!;
    return !(operator === "×" || operator === "÷") || !(previous === "×" || previous === "÷");
  });
}

export function validateBattleQuestion(
  question: Pick<BattleQuestion, "operands" | "operators" | "answer">,
  difficulty: BattleDifficulty,
): boolean {
  const { operands, operators, answer } = question;
  if (operands.length < 2 || operands.length > 4 || operators.length !== operands.length - 1) {
    return false;
  }
  if (evaluateBattleExpression(operands, operators) !== answer) return false;

  if (difficulty === "easy") {
    return (
      operands.every((operand) => operand >= 10 && operand <= 99) &&
      operators.every((operator) => operator === "+" || operator === "-") &&
      answer >= 0 &&
      answer <= 100 &&
      hasValidEasyIntermediates(operands, operators) &&
      hasCarryOrBorrow(operands, operators)
    );
  }

  if (difficulty === "medium") {
    return (
      operands.every((operand) => operand >= 1 && operand <= 99) &&
      operators.some((operator) => operator === "×" || operator === "÷") &&
      noMultiplicativeChain(operators) &&
      answer >= 0 &&
      answer <= 100
    );
  }

  const hasMultiplicativeOperation = operators.some(
    (operator) => operator === "×" || operator === "÷",
  );
  const twoTermChallenge = operands.length === 2 &&
    operands.some((operand) => operand >= 100) &&
    hasCarryOrBorrow(operands, operators);
  const mixedChallenge = operands.length >= 3 &&
    hasMultiplicativeOperation &&
    operands.some((operand) => operand >= 100);
  return (
    operands.every((operand) => operand >= 1 && operand <= 300) &&
    noMultiplicativeChain(operators) &&
    answer >= 0 &&
    answer <= 300 &&
    (twoTermChallenge || mixedChallenge)
  );
}

function candidate(
  operands: number[],
  operators: BattleOperator[],
): Omit<BattleQuestion, "id"> | null {
  const answer = evaluateBattleExpression(operands, operators);
  if (answer === null) return null;
  return {
    operands,
    operators,
    expression: formatBattleExpression(operands, operators),
    answer,
  };
}

function easyCandidate(random: () => number) {
  const termCount = pick([2, 3] as const, random);
  const operands = Array.from({ length: termCount }, () => integer(random, 10, 99));
  const operators = Array.from(
    { length: termCount - 1 },
    () => pick(["+", "-"] as const, random),
  );
  return candidate(operands, operators);
}

function mediumCandidate(random: () => number) {
  const template = integer(random, 0, 5);
  const multiplier = integer(random, 2, 9);
  const factor = integer(random, 2, 12);
  const quotient = integer(random, 2, 20);
  const divisor = integer(random, 2, 9);
  const dividend = quotient * divisor;
  const addition = integer(random, 5, 55);
  const adjustment = integer(random, 2, 35);

  if (template === 0) return candidate([factor, multiplier, addition], ["×", "+"]);
  if (template === 1) return candidate([addition, factor, multiplier], ["+", "×"]);
  if (template === 2) return candidate([dividend, divisor, addition], ["÷", "+"]);
  if (template === 3) return candidate([addition, dividend, divisor], ["+", "÷"]);
  if (template === 4) return candidate([addition, factor, multiplier, adjustment], ["+", "×", "-"]);
  return candidate([dividend, divisor, addition, adjustment], ["÷", "+", "-"]);
}

function hardCandidate(random: () => number) {
  const termCount = pick([2, 3, 3, 4, 4] as const, random);
  const large = integer(random, 100, 260);
  const factor = integer(random, 10, 19);
  const multiplier = integer(random, 2, 9);
  const quotient = integer(random, 3, 20);
  const divisor = integer(random, 2, 9);
  const dividend = quotient * divisor;
  const adjustment = integer(random, 11, 79);

  if (termCount === 2) {
    const operator = pick(["+", "-"] as const, random);
    const second = integer(random, 11, 99);
    return candidate([large, second], [operator]);
  }

  if (termCount === 3) {
    const template = integer(random, 0, 3);
    if (template === 0) return candidate([large, factor, multiplier], ["+", "×"]);
    if (template === 1) return candidate([large, factor, multiplier], ["-", "×"]);
    if (template === 2) return candidate([factor, multiplier, large], ["×", "+"]);
    return candidate([large, dividend, divisor], ["+", "÷"]);
  }

  const template = integer(random, 0, 3);
  if (template === 0) return candidate([large, factor, multiplier, adjustment], ["+", "×", "-"]);
  if (template === 1) return candidate([large, factor, multiplier, adjustment], ["-", "×", "+"]);
  if (template === 2) return candidate([large, dividend, divisor, adjustment], ["+", "÷", "-"]);
  return candidate([factor, multiplier, large, adjustment], ["×", "+", "-"]);
}

export function generateBattleQuestions(
  count: BattleQuestionCount,
  difficulty: BattleDifficulty,
  random: () => number = Math.random,
): BattleQuestion[] {
  const questions: BattleQuestion[] = [];
  const answers = new Set<number>();
  const expressions = new Set<string>();

  for (let attempt = 0; attempt < 20_000 && questions.length < count; attempt += 1) {
    const next = difficulty === "easy"
      ? easyCandidate(random)
      : difficulty === "medium"
        ? mediumCandidate(random)
        : hardCandidate(random);
    if (!next || !validateBattleQuestion(next, difficulty)) continue;
    if (answers.has(next.answer) || expressions.has(next.expression)) continue;
    answers.add(next.answer);
    expressions.add(next.expression);
    questions.push({
      ...next,
      id: `battle-${questions.length + 1}-${next.expression.replace(/\s/g, "")}`,
    });
  }

  if (questions.length !== count) {
    throw new Error(`无法生成 ${count} 道答案唯一的${difficultyLabel(difficulty)}题目。`);
  }
  return questions;
}

export function matchBattleAnswers(
  transcript: string,
  unresolvedQuestions: BattleQuestion[],
): BattleQuestion[] {
  const unresolvedByAnswer = new Map(
    unresolvedQuestions.map((question) => [question.answer, question]),
  );
  const matched = new Map<string, BattleQuestion>();
  for (const answer of extractAnswerCandidates(transcript)) {
    const question = unresolvedByAnswer.get(answer);
    if (question) matched.set(question.id, question);
  }
  return [...matched.values()];
}

export function latestBattleCandidate(transcript: string): number | null {
  return extractAnswerCandidates(transcript).at(-1) ?? null;
}

export function difficultyLabel(difficulty: BattleDifficulty) {
  if (difficulty === "easy") return "简单";
  if (difficulty === "medium") return "中等";
  return "超难";
}

export function aggregateBattleHistory(sessions: StoredBattleSession[]): BattleHistoryGroup[] {
  const groups = new Map<string, StoredBattleSession[]>();
  for (const session of sessions) {
    const key = `${session.questionCount}-${session.difficulty}`;
    groups.set(key, [...(groups.get(key) ?? []), session]);
  }
  return [...groups.entries()]
    .map(([key, values]) => {
      const latest = [...values].sort((a, b) => b.completedAt.localeCompare(a.completedAt))[0]!;
      const totalQuestions = values.reduce((sum, session) => sum + session.questionCount, 0);
      const totalCalculation = values.reduce(
        (sum, session) => sum + session.calculationDurationMs,
        0,
      );
      return {
        key,
        questionCount: latest.questionCount,
        difficulty: latest.difficulty,
        sessions: values.length,
        averageTotalDurationMs: Math.round(
          values.reduce((sum, session) => sum + session.totalDurationMs, 0) / values.length,
        ),
        averageQuestionDurationMs: Math.round(totalCalculation / totalQuestions),
        averageCalculationDurationMs: Math.round(totalCalculation / values.length),
        childAge: latest.childAge,
        accuracy: 1,
      };
    })
    .sort((a, b) => a.questionCount - b.questionCount || a.difficulty.localeCompare(b.difficulty));
}
