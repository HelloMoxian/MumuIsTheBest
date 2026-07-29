import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

const difficultySchema = z.enum(["facts", "reverse", "advanced"]);
const operatorSchema = z.enum(["×", "÷"]);
const questionCountSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);
const MAX_GAME_WALL_CLOCK_MS = 24 * 60 * 60 * 1000;

type MultiplicationDifficulty = z.infer<typeof difficultySchema>;
type MultiplicationOperator = z.infer<typeof operatorSchema>;

function evaluate(left: number, operator: MultiplicationOperator, right: number) {
  if (operator === "×") return left * right;
  if (right === 0 || left % right !== 0) return null;
  return left / right;
}

function matchesDifficulty(
  difficulty: MultiplicationDifficulty,
  left: number,
  operator: MultiplicationOperator,
  right: number,
  answer: number,
) {
  if (evaluate(left, operator, right) !== answer) return false;
  if (difficulty === "facts") {
    return (
      operator === "×" &&
      left >= 0 &&
      left <= 10 &&
      right >= 0 &&
      right <= 10
    );
  }
  if (difficulty === "reverse") {
    return (
      operator === "÷" &&
      left >= 0 &&
      left <= 100 &&
      right >= 1 &&
      right <= 10 &&
      answer >= 0 &&
      answer <= 10
    );
  }
  if (operator === "×") {
    return (
      left >= 0 &&
      left <= 20 &&
      right >= 0 &&
      right <= 20 &&
      (left > 10 || right > 10) &&
      answer <= 400
    );
  }
  return (
    left >= 0 &&
    left <= 100 &&
    right >= 1 &&
    right <= 20 &&
    answer >= 0 &&
    answer <= 20 &&
    (right > 10 || answer > 10)
  );
}

const solvedQuestionSchema = z.object({
  id: z.string().trim().min(1).max(160),
  operands: z.tuple([
    z.number().int().min(0).max(400),
    z.number().int().min(0).max(20),
  ]),
  operators: z.tuple([operatorSchema]),
  expression: z.string().trim().min(3).max(80),
  answer: z.number().int().min(0).max(400),
  solvedDurationMs: z.number().int().min(0).max(MAX_GAME_WALL_CLOCK_MS),
  solvedAtOffsetMs: z.number().int().min(0).max(MAX_GAME_WALL_CLOCK_MS),
  solvedOrder: z.number().int().min(1).max(5),
}).superRefine((question, context) => {
  const [left, right] = question.operands;
  const [operator] = question.operators;
  if (evaluate(left, operator, right) !== question.answer) {
    context.addIssue({ code: "custom", message: "算式结果与答案不一致。" });
  }
  if (`${left} ${operator} ${right}` !== question.expression) {
    context.addIssue({ code: "custom", message: "算式文字与结构化内容不一致。" });
  }
});

const multiplicationSessionInputSchema = z.object({
  startedAt: z.string().datetime(),
  questionCount: questionCountSchema,
  difficulty: difficultySchema,
  childAge: z.number().min(0).max(18),
  totalDurationMs: z.number().int().min(0).max(MAX_GAME_WALL_CLOCK_MS),
  calculationDurationMs: z.number().int().min(0).max(MAX_GAME_WALL_CLOCK_MS),
  asrSessionCount: z.number().int().min(1).max(5),
  questions: z.array(solvedQuestionSchema).min(1).max(5),
}).superRefine((session, context) => {
  if (session.questions.length !== session.questionCount) {
    context.addIssue({ code: "custom", message: "只有全部题目解出后才能保存乘法成绩。" });
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
  if (session.questions.some((question) => {
    const [left, right] = question.operands;
    const [operator] = question.operators;
    return !matchesDifficulty(
      session.difficulty,
      left,
      operator,
      right,
      question.answer,
    );
  })) {
    context.addIssue({ code: "custom", message: "本局包含不符合所选难度的题目。" });
  }

  const ordered = [...session.questions].sort((a, b) => a.solvedOrder - b.solvedOrder);
  let previousOffset = 0;
  for (const question of ordered) {
    if (question.solvedDurationMs !== question.solvedAtOffsetMs - previousOffset) {
      context.addIssue({ code: "custom", message: "逐题耗时必须等于相邻答案的时间间隔。" });
      break;
    }
    previousOffset = question.solvedAtOffsetMs;
  }
  if (previousOffset !== session.calculationDurationMs) {
    context.addIssue({ code: "custom", message: "计算总时长必须等于最后一道题的完成时间。" });
  }
});

const storedMultiplicationSessionSchema = multiplicationSessionInputSchema.extend({
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
  sessions: z.array(storedMultiplicationSessionSchema),
});

type MultiplicationSessionInput = z.infer<typeof multiplicationSessionInputSchema>;
type MultiplicationHistoryFile = z.infer<typeof historyFileSchema>;

let writeQueue: Promise<void> = Promise.resolve();

function emptyHistory(): MultiplicationHistoryFile {
  return { schemaVersion: 1, updatedAt: new Date(0).toISOString(), sessions: [] };
}

export function registerMultiplicationHistoryApi(app: FastifyInstance, appDataDir: string) {
  const historyPath = resolve(
    appDataDir,
    "learning",
    "math",
    "multiplication-history.json",
  );

  async function readHistory() {
    try {
      return historyFileSchema.parse(JSON.parse(await readFile(historyPath, "utf8")));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyHistory();
      throw error;
    }
  }

  async function saveHistory(history: MultiplicationHistoryFile) {
    await mkdir(dirname(historyPath), { recursive: true, mode: 0o700 });
    const temporaryPath = `${historyPath}.${randomUUID()}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(history, null, 2)}\n`, { mode: 0o600 });
    await rename(temporaryPath, historyPath);
    await chmod(historyPath, 0o600);
  }

  function appendSession(input: MultiplicationSessionInput) {
    const operation = writeQueue.then(async () => {
      const history = await readHistory();
      const now = new Date().toISOString();
      const session = storedMultiplicationSessionSchema.parse({
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

  app.get("/api/math/multiplication/history", async (_request, reply) => {
    try {
      return await readHistory();
    } catch {
      return reply.code(500).send({
        code: "MULTIPLICATION_HISTORY_READ_FAILED",
        message: "乘法小能手历史暂时无法读取，请检查本机数据文件。",
      });
    }
  });

  app.post("/api/math/multiplication/history", async (request, reply) => {
    const parsed = multiplicationSessionInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        code: "INVALID_MULTIPLICATION_SESSION",
        message: "本局尚未完整解出，或数据不符合乘法小能手规则，因此没有写入历史。",
      });
    }
    try {
      return reply.code(201).send({ session: await appendSession(parsed.data) });
    } catch {
      return reply.code(500).send({
        code: "MULTIPLICATION_HISTORY_WRITE_FAILED",
        message: "挑战已经完成，但历史记录暂时无法保存，请让家长检查数据目录。",
      });
    }
  });
}
