import type {
  BattleHistoryGroup,
  BattleQuestion,
  BattleQuestionCount,
  SolvedBattleQuestion,
} from "../arithmetic-battle/logic";

export type MultiplicationDifficulty = "facts" | "reverse" | "advanced";

export type StoredMultiplicationSession = Omit<
  import("../arithmetic-battle/logic").StoredBattleSession,
  "difficulty"
> & {
  difficulty: MultiplicationDifficulty;
};

export type MultiplicationHistoryGroup = Omit<BattleHistoryGroup, "difficulty"> & {
  difficulty: MultiplicationDifficulty;
};

function integer(random: () => number, minimum: number, maximum: number) {
  return minimum + Math.floor(random() * (maximum - minimum + 1));
}

function question(
  left: number,
  operator: "×" | "÷",
  right: number,
): Omit<BattleQuestion, "id"> | null {
  if (operator === "÷") {
    if (right === 0 || left % right !== 0) return null;
    return {
      operands: [left, right],
      operators: ["÷"],
      expression: `${left} ÷ ${right}`,
      answer: left / right,
    };
  }
  return {
    operands: [left, right],
    operators: ["×"],
    expression: `${left} × ${right}`,
    answer: left * right,
  };
}

export function validateMultiplicationQuestion(
  value: Pick<BattleQuestion, "operands" | "operators" | "answer">,
  difficulty: MultiplicationDifficulty,
) {
  if (value.operands.length !== 2 || value.operators.length !== 1) return false;
  const [left, right] = value.operands;
  const [operator] = value.operators;
  if (left === undefined || right === undefined || operator === undefined) return false;
  if (![left, right, value.answer].every(Number.isInteger)) return false;

  if (difficulty === "facts") {
    return (
      operator === "×" &&
      left >= 0 &&
      left <= 10 &&
      right >= 0 &&
      right <= 10 &&
      value.answer === left * right
    );
  }

  if (difficulty === "reverse") {
    return (
      operator === "÷" &&
      left >= 0 &&
      left <= 100 &&
      right >= 1 &&
      right <= 10 &&
      left % right === 0 &&
      value.answer === left / right &&
      value.answer >= 0 &&
      value.answer <= 10
    );
  }

  if (operator === "×") {
    return (
      left >= 0 &&
      left <= 20 &&
      right >= 0 &&
      right <= 20 &&
      (left > 10 || right > 10) &&
      value.answer === left * right &&
      value.answer <= 400
    );
  }
  return (
    operator === "÷" &&
    left >= 0 &&
    left <= 100 &&
    right >= 1 &&
    right <= 20 &&
    left % right === 0 &&
    value.answer === left / right &&
    value.answer >= 0 &&
    value.answer <= 20 &&
    (right > 10 || value.answer > 10)
  );
}

function factCandidate(random: () => number) {
  return question(integer(random, 0, 10), "×", integer(random, 0, 10));
}

function reverseCandidate(random: () => number) {
  const quotient = integer(random, 0, 10);
  const divisor = integer(random, 1, 10);
  return question(quotient * divisor, "÷", divisor);
}

function advancedMultiplicationCandidate(random: () => number) {
  const larger = integer(random, 11, 20);
  const other = integer(random, 0, 20);
  return random() < 0.5
    ? question(larger, "×", other)
    : question(other, "×", larger);
}

function advancedDivisionCandidate(random: () => number) {
  const useLargeDivisor = random() < 0.5;
  const divisor = useLargeDivisor
    ? integer(random, 11, 20)
    : integer(random, 1, 10);
  const maximumQuotient = Math.min(20, Math.floor(100 / divisor));
  const minimumQuotient = useLargeDivisor ? 0 : Math.min(11, maximumQuotient);
  const quotient = integer(random, minimumQuotient, maximumQuotient);
  return question(divisor * quotient, "÷", divisor);
}

export function generateMultiplicationQuestions(
  count: BattleQuestionCount,
  difficulty: MultiplicationDifficulty,
  random: () => number = Math.random,
): BattleQuestion[] {
  const questions: BattleQuestion[] = [];
  const answers = new Set<number>();
  const expressions = new Set<string>();

  for (let attempt = 0; attempt < 20_000 && questions.length < count; attempt += 1) {
    let next: Omit<BattleQuestion, "id"> | null;
    if (difficulty === "facts") {
      next = factCandidate(random);
    } else if (difficulty === "reverse") {
      next = reverseCandidate(random);
    } else {
      const useMultiplication = count > 1
        ? questions.length % 2 === 0
        : random() < 0.5;
      next = useMultiplication
        ? advancedMultiplicationCandidate(random)
        : advancedDivisionCandidate(random);
    }
    if (!next || !validateMultiplicationQuestion(next, difficulty)) continue;
    if (answers.has(next.answer) || expressions.has(next.expression)) continue;
    answers.add(next.answer);
    expressions.add(next.expression);
    questions.push({
      ...next,
      id: `multiplication-${questions.length + 1}-${next.expression.replace(/\s/g, "")}`,
    });
  }

  if (questions.length !== count) {
    throw new Error(`无法生成 ${count} 道答案唯一的${multiplicationDifficultyLabel(difficulty)}题目。`);
  }
  return questions;
}

export function multiplicationDifficultyLabel(difficulty: MultiplicationDifficulty) {
  if (difficulty === "facts") return "0—10 乘法";
  if (difficulty === "reverse") return "逆向除法";
  return "进阶乘除";
}

export function aggregateMultiplicationHistory(
  sessions: StoredMultiplicationSession[],
): MultiplicationHistoryGroup[] {
  const groups = new Map<string, StoredMultiplicationSession[]>();
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

export type { BattleQuestion, BattleQuestionCount, SolvedBattleQuestion };
