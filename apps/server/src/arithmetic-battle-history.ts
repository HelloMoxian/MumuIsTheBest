import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

const difficultySchema = z.enum(["easy", "medium", "hard"]);
const operatorSchema = z.enum(["+", "-", "×", "÷"]);
const questionCountSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);

type BattleOperator = z.infer<typeof operatorSchema>;
type BattleDifficulty = z.infer<typeof difficultySchema>;
const MAX_BATTLE_WALL_CLOCK_MS = 24 * 60 * 60 * 1000;

function evaluateExpression(operands: number[], operators: BattleOperator[]) {
  if (operands.length < 2 || operands.length !== operators.length + 1) return null;
  const reducedValues = [operands[0]!];
  const reducedOperators: Array<"+" | "-"> = [];
  for (let index = 0; index < operators.length; index += 1) {
    const operator = operators[index]!;
    const next = operands[index + 1]!;
    if (operator === "×") {
      reducedValues[reducedValues.length - 1] = reducedValues.at(-1)! * next;
    } else if (operator === "÷") {
      const current = reducedValues.at(-1)!;
      if (next === 0 || current % next !== 0) return null;
      reducedValues[reducedValues.length - 1] = current / next;
    } else {
      reducedValues.push(next);
      reducedOperators.push(operator);
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

function formatExpression(operands: number[], operators: BattleOperator[]) {
  return operands.map((operand, index) => (
    index === 0 ? String(operand) : `${operators[index - 1]} ${operand}`
  )).join(" ");
}

function hasCarryOrBorrow(operands: number[], operators: BattleOperator[]) {
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

function validEasyIntermediates(operands: number[], operators: BattleOperator[]) {
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

function matchesDifficulty(
  difficulty: BattleDifficulty,
  operands: number[],
  operators: BattleOperator[],
  answer: number,
) {
  if (difficulty === "easy") {
    return (
      operands.every((operand) => operand >= 10 && operand <= 99) &&
      operators.every((operator) => operator === "+" || operator === "-") &&
      answer >= 0 &&
      answer <= 100 &&
      validEasyIntermediates(operands, operators) &&
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
  const twoTermChallenge = operands.length === 2 &&
    operands.some((operand) => operand >= 100) &&
    hasCarryOrBorrow(operands, operators);
  const mixedChallenge = operands.length >= 3 &&
    operators.some((operator) => operator === "×" || operator === "÷") &&
    operands.some((operand) => operand >= 100);
  return (
    operands.every((operand) => operand >= 1 && operand <= 300) &&
    noMultiplicativeChain(operators) &&
    answer >= 0 &&
    answer <= 300 &&
    (twoTermChallenge || mixedChallenge)
  );
}

const solvedQuestionSchema = z.object({
  id: z.string().trim().min(1).max(160),
  operands: z.array(z.number().int().min(0).max(300)).min(2).max(4),
  operators: z.array(operatorSchema).min(1).max(3),
  expression: z.string().trim().min(3).max(160),
  answer: z.number().int().min(0).max(300),
  solvedDurationMs: z.number().int().min(0).max(MAX_BATTLE_WALL_CLOCK_MS),
  solvedAtOffsetMs: z.number().int().min(0).max(MAX_BATTLE_WALL_CLOCK_MS),
  solvedOrder: z.number().int().min(1).max(5),
}).superRefine((question, context) => {
  const evaluated = evaluateExpression(question.operands, question.operators);
  if (evaluated !== question.answer) {
    context.addIssue({ code: "custom", message: "算式结果与答案不一致。" });
  }
  if (formatExpression(question.operands, question.operators) !== question.expression) {
    context.addIssue({ code: "custom", message: "算式文字与结构化内容不一致。" });
  }
});

const battleSessionInputSchema = z.object({
  startedAt: z.string().datetime(),
  questionCount: questionCountSchema,
  difficulty: difficultySchema,
  childAge: z.number().min(0).max(18),
  totalDurationMs: z.number().int().min(0).max(MAX_BATTLE_WALL_CLOCK_MS),
  calculationDurationMs: z.number().int().min(0).max(MAX_BATTLE_WALL_CLOCK_MS),
  asrSessionCount: z.number().int().min(1).max(5),
  questions: z.array(solvedQuestionSchema).min(1).max(5),
}).superRefine((session, context) => {
  if (session.questions.length !== session.questionCount) {
    context.addIssue({ code: "custom", message: "只有全部题目解出后才能保存算数大战成绩。" });
  }
  if (session.calculationDurationMs > session.totalDurationMs) {
    context.addIssue({ code: "custom", message: "计算时间不能超过总耗时。" });
  }
  const ids = new Set(session.questions.map((question) => question.id));
  const expressions = new Set(session.questions.map((question) => question.expression));
  const answers = new Set(session.questions.map((question) => question.answer));
  const orders = new Set(session.questions.map((question) => question.solvedOrder));
  if (
    ids.size !== session.questions.length ||
    expressions.size !== session.questions.length ||
    answers.size !== session.questions.length ||
    orders.size !== session.questions.length
  ) {
    context.addIssue({ code: "custom", message: "题目、答案和解题顺序必须互不重复。" });
  }
  if (session.questions.some((question) => (
    !matchesDifficulty(
      session.difficulty,
      question.operands,
      question.operators,
      question.answer,
    )
  ))) {
    context.addIssue({ code: "custom", message: "本局包含不符合所选难度的题目。" });
  }

  const ordered = [...session.questions].sort((a, b) => a.solvedOrder - b.solvedOrder);
  let previousOffset = 0;
  for (const question of ordered) {
    if (question.solvedDurationMs !== question.solvedAtOffsetMs - previousOffset) {
      context.addIssue({ code: "custom", message: "逐题耗时必须等于相邻正确答案的时间间隔。" });
      break;
    }
    previousOffset = question.solvedAtOffsetMs;
  }
  if (previousOffset !== session.calculationDurationMs) {
    context.addIssue({ code: "custom", message: "计算总时长必须等于最后一道题的完成时间。" });
  }
});

const storedBattleSessionSchema = battleSessionInputSchema.extend({
  id: z.string().uuid(),
  completedAt: z.string().datetime(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  correctCount: z.number().int().min(1).max(5),
  accuracy: z.literal(1),
});

const historyFileSchema = z.object({
  schemaVersion: z.literal(1),
  updatedAt: z.string().datetime(),
  sessions: z.array(storedBattleSessionSchema),
});

type BattleSessionInput = z.infer<typeof battleSessionInputSchema>;
type BattleHistoryFile = z.infer<typeof historyFileSchema>;

let writeQueue: Promise<void> = Promise.resolve();

function emptyHistory(): BattleHistoryFile {
  return { schemaVersion: 1, updatedAt: new Date(0).toISOString(), sessions: [] };
}

export function registerArithmeticBattleHistoryApi(app: FastifyInstance, appDataDir: string) {
  const historyPath = resolve(
    appDataDir,
    "learning",
    "math",
    "arithmetic-battle-history.json",
  );

  async function readHistory() {
    try {
      return historyFileSchema.parse(JSON.parse(await readFile(historyPath, "utf8")));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyHistory();
      throw error;
    }
  }

  async function saveHistory(history: BattleHistoryFile) {
    await mkdir(dirname(historyPath), { recursive: true, mode: 0o700 });
    const temporaryPath = `${historyPath}.${randomUUID()}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(history, null, 2)}\n`, { mode: 0o600 });
    await rename(temporaryPath, historyPath);
    await chmod(historyPath, 0o600);
  }

  function appendSession(input: BattleSessionInput) {
    const operation = writeQueue.then(async () => {
      const history = await readHistory();
      const now = new Date().toISOString();
      const session = storedBattleSessionSchema.parse({
        ...input,
        id: randomUUID(),
        completedAt: now,
        createdAt: now,
        updatedAt: now,
        correctCount: input.questionCount,
        accuracy: 1,
      });
      await saveHistory({
        schemaVersion: 1,
        updatedAt: now,
        sessions: [...history.sessions, session],
      });
      return session;
    });
    writeQueue = operation.then(() => undefined, () => undefined);
    return operation;
  }

  app.get("/api/math/arithmetic-battle/history", async (_request, reply) => {
    try {
      return await readHistory();
    } catch {
      return reply.code(500).send({
        code: "BATTLE_HISTORY_READ_FAILED",
        message: "算数大战历史暂时无法读取，请检查本机数据文件。",
      });
    }
  });

  app.post("/api/math/arithmetic-battle/history", async (request, reply) => {
    const parsed = battleSessionInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        code: "INVALID_BATTLE_SESSION",
        message: "本局尚未完整解出，或数据不符合算数大战规则，因此没有写入历史。",
      });
    }
    try {
      return reply.code(201).send({ session: await appendSession(parsed.data) });
    } catch {
      return reply.code(500).send({
        code: "BATTLE_HISTORY_WRITE_FAILED",
        message: "挑战已经完成，但历史记录暂时无法保存，请让家长检查数据目录。",
      });
    }
  });
}
